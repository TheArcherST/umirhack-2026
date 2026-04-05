from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from hack_backend.core.compliance_notifications import (
    queue_compliance_email_notification,
)
from hack_backend.core.models import (
    ComplianceCurrentFinding,
    ComplianceEvaluation,
    ComplianceEvent,
    ComplianceEventKind,
    ComplianceEventOrigin,
    ComplianceMode,
    CompliancePolicy,
    CompliancePolicyRevision,
    TaskRun,
    TaskRunResult,
)

ENTITY_KIND_TASK_STREAM = "task_stream"

SUPPORTED_ENTITY_KINDS = {
    ENTITY_KIND_TASK_STREAM,
}


class ComplianceValidationError(ValueError):
    pass


@dataclass(slots=True, frozen=True)
class ObservedEntity:
    subject_key: str
    subject_label: str
    host_id: str | None
    scope_key: str | None
    values: dict[str, Any]
    evidence_json: dict[str, Any]
    expires_at: datetime | None = None


@dataclass(slots=True, frozen=True)
class ExtractedSource:
    source_kind: str
    source_record_id: str
    observed_at: datetime
    authoritative_scope_key: str | None
    entities: list[ObservedEntity]


def normalize_policy_definition(
    *,
    entity_kind: str,
    definition_json: dict[str, Any] | None,
    available_hosts: list[Any],  # noqa: ARG001 - kept for interface compatibility
) -> tuple[dict[str, Any], dict[str, Any]]:
    if entity_kind not in SUPPORTED_ENTITY_KINDS:
        raise ComplianceValidationError(
            f"Unsupported compliance entity kind: {entity_kind}"
        )

    definition = dict(definition_json or {})
    raw_requirements = definition.get("requirements")
    raw_forbids = definition.get("forbids")
    legacy_rules = definition.get("rules")

    requirements_input = (
        raw_requirements if isinstance(raw_requirements, list) else []
    )
    forbids_input = raw_forbids if isinstance(raw_forbids, list) else []
    if not requirements_input and not forbids_input and isinstance(legacy_rules, list):
        forbids_input = legacy_rules

    if not requirements_input and not forbids_input:
        raise ComplianceValidationError(
            "Compliance policy must contain at least one rule"
        )

    normalized_requirements = [
        _normalize_task_stream_rule(index=index, raw_rule=raw_rule)
        for index, raw_rule in enumerate(requirements_input)
    ]
    normalized_forbids = [
        _normalize_task_stream_rule(index=index + len(normalized_requirements), raw_rule=raw_rule)
        for index, raw_rule in enumerate(forbids_input)
    ]
    return {"requirements": normalized_requirements, "forbids": normalized_forbids}, {
        "entity_kind": entity_kind,
        "requirements": [
            _compile_task_stream_rule(rule) for rule in normalized_requirements
        ],
        "forbids": [_compile_task_stream_rule(rule) for rule in normalized_forbids],
    }


async def rebuild_policy(
    session: AsyncSession,
    *,
    policy: CompliancePolicy,
    revision: CompliancePolicyRevision | None,
) -> None:
    previous_findings = await _current_findings_for_policy(
        session,
        policy_id=policy.id,
    )
    await session.execute(
        delete(ComplianceCurrentFinding).where(
            ComplianceCurrentFinding.policy_id == policy.id
        )
    )

    if not policy.is_enabled or policy.deleted_at is not None or revision is None:
        return

    rows = (
        await session.execute(
            select(TaskRun, TaskRunResult)
            .join(TaskRunResult, TaskRunResult.task_run_id == TaskRun.id)
            .where(
                TaskRun.environment_id == policy.environment_id,
                TaskRun.finished_at.is_not(None),
            )
            .order_by(
                TaskRun.finished_at.asc(),
                TaskRun.queued_at.asc(),
                TaskRun.id.asc(),
            )
        )
    ).all()
    for task_run, task_result in rows:
        await _apply_policy_to_task_result(
            session,
            policy=policy,
            revision=revision,
            task_run=task_run,
            task_result=task_result,
            event_origin=ComplianceEventOrigin.BACKFILL,
            emit_events=False,
        )

    await _synchronize_rebuild_events(
        session,
        policy=policy,
        revision=revision,
        event_origin=ComplianceEventOrigin.BACKFILL,
        previous_findings=previous_findings,
    )


async def apply_compliance_materialization(
    session: AsyncSession,
    *,
    environment_id: str,
    task_run: TaskRun | None = None,
    task_result: TaskRunResult | None = None,
    telemetry_record: Any | None = None,  # noqa: ARG001 - interface compatibility
    metric_snapshots: list[Any] | None = None,  # noqa: ARG001 - interface compatibility
) -> None:
    if task_run is None or task_result is None:
        return

    policies = list(
        await session.scalars(
            select(CompliancePolicy).where(
                CompliancePolicy.environment_id == environment_id,
                CompliancePolicy.is_enabled.is_(True),
                CompliancePolicy.deleted_at.is_(None),
                CompliancePolicy.current_revision_id.is_not(None),
                CompliancePolicy.entity_kind == ENTITY_KIND_TASK_STREAM,
            )
        )
    )
    if not policies:
        return

    revisions_by_id = {
        revision.id: revision
        for revision in await session.scalars(
            select(CompliancePolicyRevision).where(
                CompliancePolicyRevision.id.in_(
                    [
                        policy.current_revision_id
                        for policy in policies
                        if policy.current_revision_id
                    ]
                )
            )
        )
    }

    for policy in policies:
        revision = revisions_by_id.get(policy.current_revision_id or "")
        if revision is None:
            continue
        await _apply_policy_to_task_result(
            session,
            policy=policy,
            revision=revision,
            task_run=task_run,
            task_result=task_result,
            event_origin=ComplianceEventOrigin.LIVE,
        )


def _normalize_rule_id(raw_value: Any, *, index: int) -> str:
    text = str(raw_value or "").strip().lower().replace(" ", "-")
    if text:
        return text[:64]
    return f"rule-{index + 1}"


def _normalize_rule_label(raw_value: Any, *, index: int) -> str:
    text = str(raw_value or "").strip()
    if text:
        return text[:120]
    return f"Rule {index + 1}"


def _ensure_valid_regex(pattern: str, *, field_name: str) -> None:
    try:
        re.compile(pattern, re.IGNORECASE)
    except re.error as exc:
        raise ComplianceValidationError(
            f"{field_name} must be a valid regular expression"
        ) from exc


def _normalize_task_stream_rule(
    *,
    index: int,
    raw_rule: Any,
) -> dict[str, Any]:
    if not isinstance(raw_rule, dict):
        raise ComplianceValidationError("Each task stream rule must be an object")

    task_kind = str(raw_rule.get("task_kind") or "").strip() or None
    input_pattern = str(raw_rule.get("input_pattern") or "").strip() or None
    stdout_pattern = str(raw_rule.get("stdout_pattern") or "").strip() or None
    stderr_pattern = str(raw_rule.get("stderr_pattern") or "").strip() or None
    input_negated = bool(raw_rule.get("input_negated"))
    stdout_negated = bool(raw_rule.get("stdout_negated"))
    stderr_negated = bool(raw_rule.get("stderr_negated"))

    for field_name, pattern in (
        ("input_pattern", input_pattern),
        ("stdout_pattern", stdout_pattern),
        ("stderr_pattern", stderr_pattern),
    ):
        if pattern is not None:
            _ensure_valid_regex(pattern, field_name=field_name)

    if all(
        pattern is None
        for pattern in (
            input_pattern,
            stdout_pattern,
            stderr_pattern,
        )
    ):
        raise ComplianceValidationError(
            "Task stream rule must define at least one stream regex"
        )

    return {
        "id": _normalize_rule_id(raw_rule.get("id"), index=index),
        "label": _normalize_rule_label(raw_rule.get("label"), index=index),
        "task_kind": task_kind,
        "input_pattern": input_pattern,
        "input_negated": input_negated,
        "stdout_pattern": stdout_pattern,
        "stdout_negated": stdout_negated,
        "stderr_pattern": stderr_pattern,
        "stderr_negated": stderr_negated,
    }


def _compile_task_stream_rule(rule: dict[str, Any]) -> dict[str, Any]:
    clauses: list[dict[str, Any]] = []
    if rule["task_kind"] is not None:
        clauses.append(
            {
                "field": "task_kind",
                "operator": "equals_ci",
                "value": rule["task_kind"],
            }
        )
    for field_name, value_key, negated_key in (
        ("input_text", "input_pattern", "input_negated"),
        ("stdout_text", "stdout_pattern", "stdout_negated"),
        ("stderr_text", "stderr_pattern", "stderr_negated"),
    ):
        if rule[value_key] is None:
            continue
        clauses.append(
            {
                "field": field_name,
                "operator": "regex_search",
                "value": rule[value_key],
                "negated": bool(rule.get(negated_key)),
            }
        )
    return {
        "id": rule["id"],
        "label": rule["label"],
        "clauses": clauses,
    }


def _matched_rule_labels(
    definition_json: dict[str, Any],
    matched_rule_ids: list[str],
) -> list[str]:
    labels_by_id = {
        str(rule.get("id")): str(rule.get("label") or rule.get("id"))
        for rule in _all_definition_rules(definition_json)
        if isinstance(rule, dict)
    }
    return [
        labels_by_id.get(rule_id, rule_id)
        for rule_id in matched_rule_ids
    ]


def _all_definition_rules(definition_json: dict[str, Any] | None) -> list[dict[str, Any]]:
    definition = definition_json or {}
    requirements = definition.get("requirements")
    forbids = definition.get("forbids")
    legacy_rules = definition.get("rules")

    if isinstance(requirements, list) or isinstance(forbids, list):
        return [
            *(requirements if isinstance(requirements, list) else []),
            *(forbids if isinstance(forbids, list) else []),
        ]
    if isinstance(legacy_rules, list):
        return legacy_rules
    return []


def _evaluate_compiled_policy(
    *,
    compiled_json: dict[str, Any],
    mode: ComplianceMode,
    entity_values: dict[str, Any],
) -> tuple[bool, list[str]]:
    requirement_rules = compiled_json.get("requirements")
    forbid_rules = compiled_json.get("forbids")
    legacy_rules = compiled_json.get("rules")

    if not isinstance(requirement_rules, list) and not isinstance(forbid_rules, list):
        requirement_rules = []
        forbid_rules = legacy_rules if isinstance(legacy_rules, list) else []

    violated_rule_ids: list[str] = []
    for rule in requirement_rules or []:
        if not _rule_matches(rule=rule, entity_values=entity_values):
            violated_rule_ids.append(str(rule["id"]))
    for rule in forbid_rules or []:
        if _rule_matches(rule=rule, entity_values=entity_values):
            violated_rule_ids.append(str(rule["id"]))

    if mode == ComplianceMode.BLACKLIST:
        return bool(violated_rule_ids), violated_rule_ids
    return not violated_rule_ids, violated_rule_ids


def _rule_matches(*, rule: dict[str, Any], entity_values: dict[str, Any]) -> bool:
    return all(
        _clause_matches(clause=clause, entity_values=entity_values)
        for clause in rule.get("clauses") or []
    )


def _clause_matches(*, clause: dict[str, Any], entity_values: dict[str, Any]) -> bool:
    field = str(clause["field"])
    operator = str(clause["operator"])
    expected = clause.get("value")
    actual = entity_values.get(field)

    if operator == "equals_ci":
        return str(actual or "").strip().lower() == str(expected or "").strip().lower()
    if operator == "regex_search":
        try:
            pattern = re.compile(str(expected or ""), re.IGNORECASE)
        except re.error:
            return False
        matched = bool(pattern.search(str(actual or "")))
        if clause.get("negated"):
            return not matched
        return matched
    raise ComplianceValidationError(f"Unsupported compliance operator: {operator}")


async def _apply_policy_to_task_result(
    session: AsyncSession,
    *,
    policy: CompliancePolicy,
    revision: CompliancePolicyRevision,
    task_run: TaskRun,
    task_result: TaskRunResult,
    event_origin: ComplianceEventOrigin,
    emit_events: bool = True,
) -> None:
    extracted = _extract_task_result_source(
        task_run=task_run,
        task_result=task_result,
    )
    await _apply_extracted_source(
        session,
        policy=policy,
        revision=revision,
        extracted=extracted,
        event_origin=event_origin,
        emit_events=emit_events,
    )


def _extract_task_result_source(
    *,
    task_run: TaskRun,
    task_result: TaskRunResult,
) -> ExtractedSource:
    host = task_run.host
    host_label = host.name if host is not None else task_run.host_id
    task_kind = task_run.task_template.kind
    task_name = task_run.task_template.name
    subject_key = f"task-stream:{task_run.host_id}:{task_kind}"
    merged_input = _merged_task_input(task_run)
    observed_at = task_run.finished_at or task_result.created_at

    return ExtractedSource(
        source_kind="task_run_result",
        source_record_id=task_run.id,
        observed_at=observed_at,
        authoritative_scope_key=subject_key,
        entities=[
            ObservedEntity(
                subject_key=subject_key,
                subject_label=f"{host_label}: {task_kind}",
                host_id=task_run.host_id,
                scope_key=subject_key,
                values={
                    "task_kind": task_kind,
                    "input_text": _serialize_json_like(merged_input),
                    "stdout_text": task_result.stdout_text or "",
                    "stderr_text": task_result.stderr_text or "",
                    "summary_text": _serialize_json_like(task_result.summary_json),
                },
                evidence_json={
                    "task_run_id": task_run.id,
                    "task_kind": task_kind,
                    "task_name": task_name,
                    "exit_code": task_result.exit_code,
                    "input_json": merged_input,
                    "summary_json": task_result.summary_json or {},
                },
            )
        ],
    )


async def _apply_extracted_source(
    session: AsyncSession,
    *,
    policy: CompliancePolicy,
    revision: CompliancePolicyRevision,
    extracted: ExtractedSource,
    event_origin: ComplianceEventOrigin,
    emit_events: bool,
) -> None:
    previous_by_subject: dict[str, ComplianceCurrentFinding] = {}
    if extracted.authoritative_scope_key is not None:
        previous_by_subject = await _current_findings_for_scope(
            session,
            policy_id=policy.id,
            scope_key=extracted.authoritative_scope_key,
        )

    observed_subjects: set[str] = set()
    for entity in extracted.entities:
        observed_subjects.add(entity.subject_key)
        is_violation, matched_rule_ids = _evaluate_compiled_policy(
            compiled_json=revision.compiled_json or {},
            mode=policy.mode,
            entity_values=entity.values,
        )
        await _append_evaluation(
            session,
            policy=policy,
            revision=revision,
            entity=entity,
            source_kind=extracted.source_kind,
            source_record_id=extracted.source_record_id,
            observed_at=extracted.observed_at,
            is_violation=is_violation,
            matched_rule_ids=matched_rule_ids,
            evidence_json=entity.evidence_json,
            expires_at=entity.expires_at,
            event_origin=event_origin,
            emit_events=emit_events,
        )

    if extracted.authoritative_scope_key is None:
        return

    for subject_key, previous in previous_by_subject.items():
        if subject_key in observed_subjects:
            continue
        if not _is_active_violation(
            previous.is_violation,
            expires_at=previous.expires_at,
            at=extracted.observed_at,
        ):
            continue
        clearing_entity = ObservedEntity(
            subject_key=subject_key,
            subject_label=previous.subject_label,
            host_id=previous.host_id,
            scope_key=previous.scope_key,
            values={},
            evidence_json={
                "cleared_by_snapshot": True,
                "previous_evaluation_id": previous.latest_evaluation_id,
            },
        )
        await _append_evaluation(
            session,
            policy=policy,
            revision=revision,
            entity=clearing_entity,
            source_kind=extracted.source_kind,
            source_record_id=extracted.source_record_id,
            observed_at=extracted.observed_at,
            is_violation=False,
            matched_rule_ids=[],
            evidence_json=clearing_entity.evidence_json,
            expires_at=None,
            event_origin=event_origin,
            emit_events=emit_events,
        )


async def _append_evaluation(
    session: AsyncSession,
    *,
    policy: CompliancePolicy,
    revision: CompliancePolicyRevision,
    entity: ObservedEntity,
    source_kind: str,
    source_record_id: str,
    observed_at: datetime,
    is_violation: bool,
    matched_rule_ids: list[str],
    evidence_json: dict[str, Any],
    expires_at: datetime | None,
    event_origin: ComplianceEventOrigin,
    emit_events: bool,
) -> None:
    previous = await _current_finding_for_subject(
        session,
        policy_id=policy.id,
        subject_key=entity.subject_key,
    )

    evaluation = ComplianceEvaluation(
        policy_id=policy.id,
        revision_id=revision.id,
        environment_id=policy.environment_id,
        host_id=entity.host_id,
        entity_kind=policy.entity_kind,
        subject_key=entity.subject_key,
        subject_label=entity.subject_label,
        scope_key=entity.scope_key,
        source_kind=source_kind,
        source_record_id=source_record_id,
        observed_at=observed_at,
        is_violation=is_violation,
        event_origin=event_origin,
        matched_rule_ids_json=matched_rule_ids,
        evidence_json=evidence_json,
        expires_at=expires_at,
    )
    session.add(evaluation)
    await session.flush()

    previous_is_violation = (
        _is_active_violation(
            previous.is_violation,
            expires_at=previous.expires_at,
            at=observed_at,
        )
        if previous is not None
        else False
    )
    current_is_violation = _is_active_violation(
        is_violation,
        expires_at=expires_at,
        at=observed_at,
    )

    await _upsert_current_finding(
        session,
        policy=policy,
        revision=revision,
        evaluation=evaluation,
        entity=entity,
        matched_rule_ids=matched_rule_ids,
        evidence_json=evidence_json,
        is_violation=is_violation,
        observed_at=observed_at,
        expires_at=expires_at,
    )

    if not emit_events:
        return

    if not previous_is_violation and current_is_violation:
        session.add(
            ComplianceEvent(
                policy_id=policy.id,
                revision_id=revision.id,
                evaluation_id=evaluation.id,
                environment_id=policy.environment_id,
                host_id=entity.host_id,
                entity_kind=policy.entity_kind,
                subject_key=entity.subject_key,
                subject_label=entity.subject_label,
                event_kind=ComplianceEventKind.RISE,
                event_origin=event_origin,
                happened_at=observed_at,
                payload_json={
                    "matched_rule_ids": matched_rule_ids,
                    "evidence": evidence_json,
                },
            )
        )
        queue_compliance_email_notification(
            session,
            environment_id=policy.environment_id,
            policy_name=policy.name,
            event_kind=ComplianceEventKind.RISE.value,
            event_origin=event_origin.value,
            subject_label=entity.subject_label,
            happened_at=observed_at,
            matched_rule_labels=_matched_rule_labels(
                revision.definition_json or {},
                matched_rule_ids,
            ),
        )
    elif previous_is_violation and not current_is_violation:
        session.add(
            ComplianceEvent(
                policy_id=policy.id,
                revision_id=revision.id,
                evaluation_id=evaluation.id,
                environment_id=policy.environment_id,
                host_id=entity.host_id,
                entity_kind=policy.entity_kind,
                subject_key=entity.subject_key,
                subject_label=entity.subject_label,
                event_kind=ComplianceEventKind.RESOLVED,
                event_origin=event_origin,
                happened_at=observed_at,
                payload_json={
                    "matched_rule_ids": matched_rule_ids,
                    "evidence": evidence_json,
                },
            )
        )
        queue_compliance_email_notification(
            session,
            environment_id=policy.environment_id,
            policy_name=policy.name,
            event_kind=ComplianceEventKind.RESOLVED.value,
            event_origin=event_origin.value,
            subject_label=entity.subject_label,
            happened_at=observed_at,
            matched_rule_labels=_matched_rule_labels(
                revision.definition_json or {},
                matched_rule_ids,
            ),
        )


def _is_active_violation(
    is_violation: bool,
    *,
    expires_at: datetime | None,
    at: datetime,
) -> bool:
    if not is_violation:
        return False
    if expires_at is not None and expires_at <= at:
        return False
    return True


async def _current_finding_for_subject(
    session: AsyncSession,
    *,
    policy_id: str,
    subject_key: str,
) -> ComplianceCurrentFinding | None:
    return await session.scalar(
        select(ComplianceCurrentFinding).where(
            ComplianceCurrentFinding.policy_id == policy_id,
            ComplianceCurrentFinding.subject_key == subject_key,
        )
    )


async def _current_findings_for_scope(
    session: AsyncSession,
    *,
    policy_id: str,
    scope_key: str,
) -> dict[str, ComplianceCurrentFinding]:
    findings = list(
        await session.scalars(
            select(ComplianceCurrentFinding).where(
                ComplianceCurrentFinding.policy_id == policy_id,
                ComplianceCurrentFinding.scope_key == scope_key,
            )
        )
    )
    return {finding.subject_key: finding for finding in findings}


async def _current_findings_for_policy(
    session: AsyncSession,
    *,
    policy_id: str,
) -> dict[str, ComplianceCurrentFinding]:
    findings = list(
        await session.scalars(
            select(ComplianceCurrentFinding).where(
                ComplianceCurrentFinding.policy_id == policy_id,
            )
        )
    )
    return {finding.subject_key: finding for finding in findings}


async def _upsert_current_finding(
    session: AsyncSession,
    *,
    policy: CompliancePolicy,
    revision: CompliancePolicyRevision,
    evaluation: ComplianceEvaluation,
    entity: ObservedEntity,
    matched_rule_ids: list[str],
    evidence_json: dict[str, Any],
    is_violation: bool,
    observed_at: datetime,
    expires_at: datetime | None,
) -> None:
    finding = await _current_finding_for_subject(
        session,
        policy_id=policy.id,
        subject_key=entity.subject_key,
    )
    if finding is None:
        session.add(
            ComplianceCurrentFinding(
                policy_id=policy.id,
                revision_id=revision.id,
                environment_id=policy.environment_id,
                latest_evaluation_id=evaluation.id,
                host_id=entity.host_id,
                entity_kind=policy.entity_kind,
                subject_key=entity.subject_key,
                subject_label=entity.subject_label,
                scope_key=entity.scope_key,
                matched_rule_ids_json=matched_rule_ids,
                evidence_json=evidence_json,
                observed_at=observed_at,
                expires_at=expires_at,
                is_violation=is_violation,
            )
        )
        return

    finding.revision_id = revision.id
    finding.latest_evaluation_id = evaluation.id
    finding.host_id = entity.host_id
    finding.subject_label = entity.subject_label
    finding.scope_key = entity.scope_key
    finding.matched_rule_ids_json = matched_rule_ids
    finding.evidence_json = evidence_json
    finding.observed_at = observed_at
    finding.expires_at = expires_at
    finding.is_violation = is_violation


def _merged_task_input(task_run: TaskRun) -> dict[str, Any]:
    payload = dict(task_run.task_template.payload_json or {})
    payload.update(task_run.payload_override_json or {})
    if task_run.task_template.approved_command:
        payload.setdefault("approved_command", task_run.task_template.approved_command)
    return payload


async def _synchronize_rebuild_events(
    session: AsyncSession,
    *,
    policy: CompliancePolicy,
    revision: CompliancePolicyRevision,
    event_origin: ComplianceEventOrigin,
    previous_findings: dict[str, ComplianceCurrentFinding],
) -> None:
    current_findings = await _current_findings_for_policy(
        session,
        policy_id=policy.id,
    )
    subject_keys = sorted(set(previous_findings) | set(current_findings))
    for subject_key in subject_keys:
        previous = previous_findings.get(subject_key)
        current = current_findings.get(subject_key)
        comparison_at = (
            current.observed_at
            if current is not None
            else previous.observed_at
            if previous is not None
            else datetime.now()
        )
        previous_is_violation = (
            _is_active_violation(
                previous.is_violation,
                expires_at=previous.expires_at,
                at=comparison_at,
            )
            if previous is not None
            else False
        )
        current_is_violation = (
            _is_active_violation(
                current.is_violation,
                expires_at=current.expires_at,
                at=comparison_at,
            )
            if current is not None
            else False
        )
        if previous_is_violation == current_is_violation:
            continue

        event = ComplianceEvent(
            policy_id=policy.id,
            revision_id=revision.id,
            evaluation_id=current.latest_evaluation_id if current is not None else None,
            environment_id=policy.environment_id,
            host_id=(current.host_id if current is not None else previous.host_id),
            entity_kind=policy.entity_kind,
            subject_key=subject_key,
            subject_label=(
                current.subject_label
                if current is not None
                else previous.subject_label
            ),
            event_kind=(
                ComplianceEventKind.RISE
                if current_is_violation
                else ComplianceEventKind.RESOLVED
            ),
            event_origin=event_origin,
            happened_at=(
                current.observed_at
                if current is not None
                else previous.observed_at
            ),
            payload_json={
                "matched_rule_ids": (
                    current.matched_rule_ids_json
                    if current is not None
                    else []
                ),
                "evidence": (
                    current.evidence_json
                    if current is not None
                    else previous.evidence_json
                ),
            },
        )
        session.add(event)
        queue_compliance_email_notification(
            session,
            environment_id=policy.environment_id,
            policy_name=policy.name,
            event_kind=event.event_kind.value,
            event_origin=event_origin.value,
            subject_label=event.subject_label,
            happened_at=event.happened_at,
            matched_rule_labels=_matched_rule_labels(
                revision.definition_json or {},
                current.matched_rule_ids_json if current is not None else [],
            ),
        )


def _serialize_json_like(value: Any) -> str:
    if value in (None, ""):
        return ""
    try:
        return json.dumps(value, sort_keys=True, ensure_ascii=True)
    except TypeError:
        return str(value)
