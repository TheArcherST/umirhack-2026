from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from hack_backend.core.compliance import (
    ComplianceValidationError,
    ENTITY_KIND_TASK_STREAM,
    normalize_policy_definition,
    rebuild_policy,
)
from hack_backend.core.models import (
    ComplianceCurrentFinding,
    ComplianceEvaluation,
    ComplianceEvent,
    ComplianceMode,
    CompliancePolicy,
    CompliancePolicyRevision,
    Environment,
    Host,
)


@dataclass(slots=True, frozen=True)
class ComplianceFindingView:
    finding: ComplianceCurrentFinding
    evaluation: ComplianceEvaluation
    policy: CompliancePolicy
    revision: CompliancePolicyRevision
    host: Host | None
    matched_rule_labels: list[str]


@dataclass(slots=True, frozen=True)
class ComplianceEventView:
    event: ComplianceEvent
    policy: CompliancePolicy
    revision: CompliancePolicyRevision
    host: Host | None


@dataclass(slots=True)
class ComplianceService:
    session: AsyncSession

    async def list_policies(self, environment_id: str) -> list[CompliancePolicy]:
        return await self._environment_policies(
            environment_id,
            include_deleted=False,
        )

    async def _environment_policies(
        self,
        environment_id: str,
        *,
        include_deleted: bool,
    ) -> list[CompliancePolicy]:
        conditions = [
            CompliancePolicy.environment_id == environment_id,
            CompliancePolicy.entity_kind == ENTITY_KIND_TASK_STREAM,
        ]
        if not include_deleted:
            conditions.append(CompliancePolicy.deleted_at.is_(None))
        return list(
            await self.session.scalars(
                select(CompliancePolicy)
                .where(*conditions)
                .order_by(CompliancePolicy.created_at.desc())
            )
        )

    async def get_policy(self, policy_id: str) -> CompliancePolicy | None:
        policy = await self.session.get(CompliancePolicy, policy_id)
        if policy is None or policy.deleted_at is not None:
            return None
        return policy

    async def get_policy_revision(
        self,
        revision_id: str | None,
    ) -> CompliancePolicyRevision | None:
        if revision_id is None:
            return None
        return await self.session.get(CompliancePolicyRevision, revision_id)

    async def create_policy(
        self,
        *,
        environment_id: str,
        name: str,
        entity_kind: str,
        mode: str,
        description: str | None,
        is_enabled: bool,
        definition_json: dict[str, Any] | None,
        actor_user_id: int | None = None,
    ) -> CompliancePolicy:
        await self._ensure_environment_exists(environment_id)
        await self._ensure_entity_kind_is_available(
            environment_id=environment_id,
            entity_kind=entity_kind,
        )
        available_hosts = await self._environment_hosts(environment_id)
        normalized_definition, compiled_definition = self._normalize_definition(
            entity_kind=entity_kind,
            definition_json=definition_json,
            available_hosts=available_hosts,
        )
        normalized_name = name.strip()
        if not normalized_name:
            raise HTTPException(status_code=400, detail="Policy name is required")

        policy = CompliancePolicy(
            environment_id=environment_id,
            name=normalized_name,
            entity_kind=entity_kind,
            mode=self._normalize_mode(mode),
            description=(description or "").strip() or None,
            is_enabled=is_enabled,
        )
        self.session.add(policy)
        await self.session.flush()

        revision = await self._create_revision(
            policy=policy,
            definition_json=normalized_definition,
            compiled_json=compiled_definition,
            actor_user_id=actor_user_id,
        )
        policy.current_revision_id = revision.id
        await self.session.flush()
        await rebuild_policy(self.session, policy=policy, revision=revision)
        return policy

    async def patch_policy(
        self,
        *,
        policy_id: str,
        name: str | None = None,
        entity_kind: str | None = None,
        mode: str | None = None,
        description: str | None = None,
        is_enabled: bool | None = None,
        definition_json: dict[str, Any] | None = None,
        actor_user_id: int | None = None,
    ) -> CompliancePolicy:
        policy = await self.get_policy(policy_id)
        if policy is None:
            raise HTTPException(status_code=404, detail="Compliance policy not found")

        current_revision = await self.get_policy_revision(policy.current_revision_id)
        next_entity_kind = entity_kind or policy.entity_kind
        next_mode = self._normalize_mode(mode) if mode is not None else policy.mode
        await self._ensure_entity_kind_is_available(
            environment_id=policy.environment_id,
            entity_kind=next_entity_kind,
            exclude_policy_id=policy.id,
        )
        next_definition_json = (
            definition_json
            if definition_json is not None
            else (current_revision.definition_json if current_revision else None)
        )

        if name is not None:
            normalized_name = name.strip()
            if not normalized_name:
                raise HTTPException(status_code=400, detail="Policy name is required")
            policy.name = normalized_name
        if description is not None:
            policy.description = description.strip() or None
        if mode is not None:
            policy.mode = next_mode
        if entity_kind is not None:
            policy.entity_kind = next_entity_kind
        if is_enabled is not None:
            policy.is_enabled = is_enabled

        available_hosts = await self._environment_hosts(policy.environment_id)
        semantic_change = (
            entity_kind is not None
            or mode is not None
            or definition_json is not None
            or current_revision is None
        )

        if semantic_change:
            normalized_definition, compiled_definition = self._normalize_definition(
                entity_kind=next_entity_kind,
                definition_json=next_definition_json,
                available_hosts=available_hosts,
            )
            revision = await self._create_revision(
                policy=policy,
                definition_json=normalized_definition,
                compiled_json=compiled_definition,
                actor_user_id=actor_user_id,
            )
            policy.current_revision_id = revision.id
            await self.session.flush()
            await rebuild_policy(self.session, policy=policy, revision=revision)
        elif is_enabled is not None:
            await rebuild_policy(
                self.session,
                policy=policy,
                revision=current_revision,
            )

        return policy

    async def delete_policy(self, policy_id: str) -> None:
        policy = await self.get_policy(policy_id)
        if policy is None:
            return
        policy.deleted_at = datetime.now(tz=UTC)
        policy.is_enabled = False
        await self.session.execute(
            delete(ComplianceCurrentFinding).where(
                ComplianceCurrentFinding.policy_id == policy_id
            )
        )

    async def list_active_findings(
        self,
        *,
        environment_id: str,
    ) -> list[ComplianceFindingView]:
        policies = {policy.id: policy for policy in await self.list_policies(environment_id)}
        current_revision_ids = [
            policy.current_revision_id
            for policy in policies.values()
            if policy.is_enabled and policy.current_revision_id is not None
        ]
        if not current_revision_ids:
            return []

        revisions = {
            revision.id: revision
            for revision in await self.session.scalars(
                select(CompliancePolicyRevision).where(
                    CompliancePolicyRevision.id.in_(current_revision_ids)
                )
            )
        }
        hosts = {
            host.id: host
            for host in await self._environment_hosts(environment_id)
        }
        findings = list(
            await self.session.scalars(
                select(ComplianceCurrentFinding).where(
                    ComplianceCurrentFinding.environment_id == environment_id,
                    ComplianceCurrentFinding.revision_id.in_(list(revisions)),
                )
            )
        )
        now = datetime.now(tz=UTC)
        if not findings:
            return []

        evaluations = {
            evaluation.id: evaluation
            for evaluation in await self.session.scalars(
                select(ComplianceEvaluation).where(
                    ComplianceEvaluation.id.in_(
                        [finding.latest_evaluation_id for finding in findings]
                    )
                )
            )
        }

        result: list[ComplianceFindingView] = []
        for finding in findings:
            policy = policies.get(finding.policy_id)
            revision = revisions.get(finding.revision_id)
            evaluation = evaluations.get(finding.latest_evaluation_id)
            if policy is None or revision is None or evaluation is None:
                continue
            if not policy.is_enabled or policy.current_revision_id != revision.id:
                continue
            if not finding.is_violation:
                continue
            if finding.expires_at is not None and finding.expires_at <= now:
                continue
            result.append(
                ComplianceFindingView(
                    finding=finding,
                    evaluation=evaluation,
                    policy=policy,
                    revision=revision,
                    host=hosts.get(finding.host_id or ""),
                    matched_rule_labels=self._matched_rule_labels(
                        revision,
                        finding.matched_rule_ids_json,
                    ),
                )
            )

        result.sort(key=lambda item: item.finding.observed_at, reverse=True)
        return result

    async def list_events(
        self,
        *,
        environment_id: str,
        limit: int = 100,
    ) -> list[ComplianceEventView]:
        policies = {
            policy.id: policy
            for policy in await self._environment_policies(
                environment_id,
                include_deleted=True,
            )
        }
        hosts = {
            host.id: host for host in await self._environment_hosts(environment_id)
        }
        events = list(
            await self.session.scalars(
                select(ComplianceEvent)
                .where(ComplianceEvent.environment_id == environment_id)
                .order_by(
                    ComplianceEvent.happened_at.desc(),
                    ComplianceEvent.created_at.desc(),
                )
                .limit(max(1, min(limit, 200)))
            )
        )
        if not events:
            return []
        revisions = {
            revision.id: revision
            for revision in await self.session.scalars(
                select(CompliancePolicyRevision).where(
                    CompliancePolicyRevision.id.in_(
                        [event.revision_id for event in events]
                    )
                )
            )
        }
        return [
            ComplianceEventView(
                event=event,
                policy=policies[event.policy_id],
                revision=revisions[event.revision_id],
                host=hosts.get(event.host_id or ""),
            )
            for event in events
            if event.policy_id in policies and event.revision_id in revisions
        ]

    def catalog(self) -> list[dict[str, Any]]:
        return [
            {
                "entity_kind": ENTITY_KIND_TASK_STREAM,
                "label": "Task stream",
                "description": (
                    "Rules over completed task runs using an optional task kind"
                    " filter plus regular expressions on serialized input,"
                    " stdout, and stderr payloads"
                ),
            },
        ]

    async def _create_revision(
        self,
        *,
        policy: CompliancePolicy,
        definition_json: dict[str, Any],
        compiled_json: dict[str, Any],
        actor_user_id: int | None,
    ) -> CompliancePolicyRevision:
        previous_revision = await self.get_policy_revision(policy.current_revision_id)
        revision = CompliancePolicyRevision(
            policy_id=policy.id,
            revision_no=(previous_revision.revision_no + 1) if previous_revision else 1,
            definition_json=definition_json,
            compiled_json=compiled_json,
            created_by_user_id=actor_user_id,
        )
        self.session.add(revision)
        await self.session.flush()
        return revision

    async def _ensure_environment_exists(self, environment_id: str) -> Environment:
        environment = await self.session.get(Environment, environment_id)
        if environment is None:
            raise HTTPException(status_code=404, detail="Environment not found")
        return environment

    async def _environment_hosts(self, environment_id: str) -> list[Host]:
        return list(
            await self.session.scalars(
                select(Host).where(Host.environment_id == environment_id)
            )
        )

    async def _ensure_entity_kind_is_available(
        self,
        *,
        environment_id: str,
        entity_kind: str,
        exclude_policy_id: str | None = None,
    ) -> None:
        existing_policies = await self._environment_policies(
            environment_id,
            include_deleted=False,
        )
        conflict = next(
            (
                policy
                for policy in existing_policies
                if policy.entity_kind == entity_kind
                and policy.id != exclude_policy_id
            ),
            None,
        )
        if conflict is not None:
            raise HTTPException(
                status_code=409,
                detail=(
                    "Only one compliance rule set is allowed per entity type"
                    " in an environment"
                ),
            )

    def _normalize_definition(
        self,
        *,
        entity_kind: str,
        definition_json: dict[str, Any] | None,
        available_hosts: list[Host],
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        try:
            return normalize_policy_definition(
                entity_kind=entity_kind,
                definition_json=definition_json,
                available_hosts=available_hosts,
            )
        except ComplianceValidationError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    def _matched_rule_labels(
        self,
        revision: CompliancePolicyRevision,
        matched_rule_ids: list[str],
    ) -> list[str]:
        labels_by_id = {
            str(rule.get("id")): str(rule.get("label") or rule.get("id"))
            for rule in (revision.definition_json or {}).get("rules") or []
            if isinstance(rule, dict)
        }
        return [
            labels_by_id.get(rule_id, rule_id)
            for rule_id in matched_rule_ids or []
        ]

    def _normalize_mode(self, value: str) -> ComplianceMode:
        raw_value = value.strip().lower()
        try:
            return ComplianceMode(raw_value)
        except ValueError as exc:
            raise HTTPException(
                status_code=400,
                detail="Compliance mode must be allowlist or blacklist",
            ) from exc
