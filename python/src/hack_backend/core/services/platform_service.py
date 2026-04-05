from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException
from sqlalchemy import delete, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from hack_backend.core.models import (
    Agent,
    AgentBootstrapToken,
    Environment,
    EnvironmentMember,
    EnvironmentMemberRole,
    GraphEdge,
    Host,
    InviteStatus,
    MetricSnapshot,
    Project,
    ProjectMember,
    ProjectMemberRole,
    TaskRun,
    TaskRunResult,
    TaskTemplate,
    TelemetryRecord,
    User,
)
from hack_backend.core.platform_ops import (
    create_hosts_for_agent,
    create_project_defaults,
    delete_hosts_and_related,
    ensure_project_templates,
    is_graph_edge_stale,
    issue_bootstrap_token,
    queue_bootstrap_tasks_for_host,
    refresh_agent_state,
    sync_hosts_for_agent,
)
from hack_backend.core.security import new_secret, password_hasher
from hack_backend.core.services.agent_versioning import AgentVersioningService


@dataclass(slots=True)
class PlatformService:
    session: AsyncSession
    agent_versioning_service: AgentVersioningService

    async def _ensure_environment_operator_membership(
        self,
        *,
        environment_id: str,
        user_id: int,
    ) -> EnvironmentMember:
        member = await self.session.get(
            EnvironmentMember,
            {"environment_id": environment_id, "user_id": user_id},
        )
        if member is None:
            member = EnvironmentMember(
                environment_id=environment_id,
                user_id=user_id,
                role=EnvironmentMemberRole.OPERATOR,
            )
            self.session.add(member)
        else:
            member.role = EnvironmentMemberRole.OPERATOR
        return member

    async def _ensure_project_admin_environment_memberships(
        self,
        *,
        project_id: str,
        environment_ids: list[str] | None = None,
        user_ids: list[int] | None = None,
    ) -> None:
        if environment_ids is None:
            environment_ids = list(
                await self.session.scalars(
                    select(Environment.id).where(Environment.project_id == project_id)
                )
            )
        else:
            environment_ids = list(dict.fromkeys(environment_ids))

        if not environment_ids:
            return

        if user_ids is None:
            user_ids = list(
                await self.session.scalars(
                    select(ProjectMember.user_id).where(
                        ProjectMember.project_id == project_id,
                        ProjectMember.role == ProjectMemberRole.ADMIN,
                        ProjectMember.invite_status == InviteStatus.ACCEPTED,
                    )
                )
            )
        else:
            user_ids = list(dict.fromkeys(user_ids))

        if not user_ids:
            return

        existing_members = (
            await self.session.execute(
                select(EnvironmentMember).where(
                    EnvironmentMember.environment_id.in_(environment_ids),
                    EnvironmentMember.user_id.in_(user_ids),
                )
            )
        ).scalars()
        existing_by_key = {
            (member.environment_id, member.user_id): member
            for member in existing_members
        }

        for environment_id in environment_ids:
            for user_id in user_ids:
                member = existing_by_key.get((environment_id, user_id))
                if member is None:
                    self.session.add(
                        EnvironmentMember(
                            environment_id=environment_id,
                            user_id=user_id,
                            role=EnvironmentMemberRole.OPERATOR,
                        )
                    )
                    continue
                member.role = EnvironmentMemberRole.OPERATOR

    async def _resolve_project_environments(
        self,
        *,
        project_id: str,
        environment_ids: list[str],
    ) -> list[Environment]:
        resolved_ids = list(dict.fromkeys(environment_ids))
        if not resolved_ids:
            return []

        environments = list(
            await self.session.scalars(
                select(Environment).where(
                    Environment.project_id == project_id,
                    Environment.id.in_(resolved_ids),
                )
            )
        )
        if len(environments) != len(resolved_ids):
            raise HTTPException(
                status_code=400,
                detail="Some environments do not belong to the target project",
            )
        return environments

    async def _resolve_environment_task_template(
        self,
        *,
        environment_id: str,
        task_template_id: str,
    ) -> tuple[Environment, TaskTemplate]:
        environment = await self.session.get(Environment, environment_id)
        if environment is None:
            raise HTTPException(status_code=404, detail="Environment not found")

        task_template = await self.session.get(TaskTemplate, task_template_id)
        if task_template is None:
            raise HTTPException(status_code=404, detail="Task template not found")
        if task_template.project_id != environment.project_id:
            raise HTTPException(
                status_code=400,
                detail="Task template does not belong to the environment project",
            )
        return environment, task_template

    async def _normalize_schedule_target_selector(
        self,
        *,
        environment_id: str,
        task_template: TaskTemplate,
        target_selector_json: dict | None,
    ) -> dict:
        selector = dict(target_selector_json or {})
        normalized: dict = {}

        host_ids = selector.get("host_ids")
        if host_ids:
            resolved_host_ids = list(dict.fromkeys(str(host_id) for host_id in host_ids))
            hosts = list(
                await self.session.scalars(
                    select(Host.id).where(
                        Host.environment_id == environment_id,
                        Host.id.in_(resolved_host_ids),
                    )
                )
            )
            if len(hosts) != len(resolved_host_ids):
                raise HTTPException(status_code=400, detail="Some hosts are invalid")
            normalized["host_ids"] = resolved_host_ids

        if task_template.kind == "diagnostic.command.custom":
            approved_command = selector.get("approved_command")
            if not isinstance(approved_command, str) or not approved_command.strip():
                raise HTTPException(
                    status_code=400,
                    detail="Custom command schedules require a non-empty approved_command",
                )
            normalized["approved_command"] = approved_command.strip()
        elif selector.get("approved_command"):
            raise HTTPException(
                status_code=400,
                detail="approved_command override is only allowed for custom command schedules",
            )

        if task_template.kind == "network.endpoint_connectivity":
            target_endpoint = selector.get("target_endpoint")
            if not isinstance(target_endpoint, str) or not target_endpoint.strip():
                raise HTTPException(
                    status_code=400,
                    detail="Endpoint connectivity schedules require a non-empty target_endpoint",
                )
            normalized["target_endpoint"] = target_endpoint.strip()
        elif selector.get("target_endpoint"):
            raise HTTPException(
                status_code=400,
                detail="target_endpoint override is only allowed for endpoint connectivity schedules",
            )

        return normalized

    async def list_projects_for_user(self, user: User) -> list[Project]:
        return list(
            await self.session.scalars(
                select(Project)
                .outerjoin(ProjectMember, ProjectMember.project_id == Project.id)
                .where(
                    or_(
                        Project.owner_id == user.id,
                        ProjectMember.user_id == user.id,
                    )
                )
                .distinct()
                .order_by(Project.created_at.desc())
            )
        )

    async def create_project(self, *, owner: User, name: str) -> Project:
        return await create_project_defaults(
            self.session,
            owner_id=owner.id,
            project_name=name,
        )

    async def list_project_members(self, project_id: str) -> list[tuple[ProjectMember, User]]:
        return (
            await self.session.execute(
                select(ProjectMember, User)
                .join(User, User.id == ProjectMember.user_id)
                .where(ProjectMember.project_id == project_id)
                .order_by(ProjectMember.invited_at.asc())
            )
        ).all()

    async def invite_project_member(self, project_id: str, email: str) -> tuple[ProjectMember, User]:
        user = await self.session.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(
                username=f"{email.split('@')[0]}-{new_secret(4)}",
                email=email,
                email_verified=False,
                password_hash=password_hasher.hash(new_secret(24)),
            )
            self.session.add(user)
            await self.session.flush()

        membership = await self.session.get(
            ProjectMember,
            {"project_id": project_id, "user_id": user.id},
        )
        if membership is None:
            membership = ProjectMember(
                project_id=project_id,
                user_id=user.id,
                role=ProjectMemberRole.MEMBER,
                invite_status=InviteStatus.PENDING,
            )
            self.session.add(membership)
            await self.session.flush()
        return membership, user

    async def update_project_member_role(
        self,
        *,
        project_id: str,
        user_id: int,
        role: str,
    ) -> tuple[ProjectMember, User]:
        membership = await self.session.get(
            ProjectMember,
            {"project_id": project_id, "user_id": user_id},
        )
        if membership is None:
            raise HTTPException(status_code=404, detail="Member not found")
        membership.role = (
            ProjectMemberRole.ADMIN
            if role == "admin"
            else ProjectMemberRole.MEMBER
        )
        membership.invite_status = InviteStatus.ACCEPTED
        if membership.role == ProjectMemberRole.ADMIN:
            await self._ensure_project_admin_environment_memberships(
                project_id=project_id,
                user_ids=[user_id],
            )
        user = await self.session.get(User, user_id)
        if user is None:
            raise HTTPException(status_code=404, detail="User not found")
        return membership, user

    async def remove_project_member(self, *, project: Project, user_id: int) -> None:
        if project.owner_id == user_id:
            raise HTTPException(status_code=400, detail="Cannot remove project owner")
        membership = await self.session.get(
            ProjectMember,
            {"project_id": project.id, "user_id": user_id},
        )
        if membership is None:
            raise HTTPException(status_code=404, detail="Member not found")
        await self.session.delete(membership)

    async def list_environments(self, project_id: str) -> list[Environment]:
        return list(
            await self.session.scalars(
                select(Environment)
                .where(Environment.project_id == project_id)
                .order_by(Environment.created_at.asc())
            )
        )

    async def create_environment(
        self,
        *,
        project_id: str,
        creator_id: int,
        name: str,
    ) -> Environment:
        environment = Environment(project_id=project_id, name=name)
        self.session.add(environment)
        await self.session.flush()
        await self._ensure_project_admin_environment_memberships(
            project_id=project_id,
            environment_ids=[environment.id],
            user_ids=[creator_id],
        )
        await self._ensure_project_admin_environment_memberships(
            project_id=project_id,
            environment_ids=[environment.id],
        )
        return environment

    async def list_environment_members(self, environment_id: str) -> list[EnvironmentMember]:
        return list(
            await self.session.scalars(
                select(EnvironmentMember).where(
                    EnvironmentMember.environment_id == environment_id
                )
            )
        )

    async def assign_environment_role(
        self,
        *,
        environment_id: str,
        user_id: int,
        role: str,
    ) -> EnvironmentMember:
        member = await self.session.get(
            EnvironmentMember,
            {"environment_id": environment_id, "user_id": user_id},
        )
        if member is None:
            member = EnvironmentMember(
                environment_id=environment_id,
                user_id=user_id,
                role=role,
            )
            self.session.add(member)
        else:
            member.role = role
        return member

    async def list_environment_hosts(self, environment_id: str) -> tuple[list[Host], dict[str, Agent]]:
        hosts = list(
            await self.session.scalars(
                select(Host).where(Host.environment_id == environment_id)
            )
        )
        agents = {
            agent.id: agent
            for agent in await self.session.scalars(
                select(Agent).where(Agent.id.in_([host.agent_id for host in hosts]))
            )
        }
        return hosts, agents

    async def list_environment_graph(self, environment_id: str) -> list[GraphEdge]:
        edges = list(
            await self.session.scalars(
                select(GraphEdge)
                .where(GraphEdge.environment_id == environment_id)
                .order_by(GraphEdge.observed_at.desc())
            )
        )
        latest_by_relation: dict[tuple[str, str | None, str | None, str], GraphEdge] = {}
        for edge in edges:
            if is_graph_edge_stale(edge):
                continue
            key = (
                edge.source_host_id,
                edge.target_host_id,
                edge.target_label,
                edge.relation_kind,
            )
            latest_by_relation.setdefault(key, edge)
        return sorted(
            latest_by_relation.values(),
            key=lambda edge: edge.observed_at,
            reverse=True,
        )

    async def list_environment_task_runs(self, environment_id: str) -> list[TaskRun]:
        return list(
            await self.session.scalars(
                select(TaskRun)
                .where(TaskRun.environment_id == environment_id)
                .order_by(TaskRun.queued_at.desc())
            )
        )

    async def list_agents(
        self,
        *,
        project_id: str,
        environment_id: str | None = None,
        status: str | None = None,
    ) -> tuple[list[Agent], dict[str, list[Environment]]]:
        await refresh_agent_state(self.session)
        agents = list(
            await self.session.scalars(
                select(Agent)
                .where(Agent.project_id == project_id)
                .order_by(Agent.created_at.desc())
            )
        )
        if status:
            agents = [agent for agent in agents if agent.status.value == status]

        host_rows = (
            await self.session.execute(
                select(Host.environment_id, Host.agent_id).where(
                    Host.agent_id.in_([agent.id for agent in agents])
                )
            )
        ).all()
        env_ids_by_agent: dict[str, set[str]] = {}
        for env_id, agent_id in host_rows:
            env_ids_by_agent.setdefault(agent_id, set()).add(env_id)

        if environment_id:
            agents = [
                agent
                for agent in agents
                if environment_id in env_ids_by_agent.get(agent.id, set())
            ]

        environment_ids = {
            env_id for env_ids in env_ids_by_agent.values() for env_id in env_ids
        }
        environments = list(
            await self.session.scalars(
                select(Environment).where(Environment.id.in_(environment_ids))
            )
        )
        environments_by_id = {environment.id: environment for environment in environments}
        resolved = {
            agent.id: [
                environments_by_id[env_id]
                for env_id in sorted(env_ids_by_agent.get(agent.id, set()))
                if env_id in environments_by_id
            ]
            for agent in agents
        }
        return agents, resolved

    async def create_agent(
        self,
        *,
        project_id: str,
        name: str,
        declared_os: str | None,
        safe_install: bool,
        max_concurrent_tasks: int,
        environment_ids: list[str],
        agent_version: str | None,
    ) -> tuple[Agent, list[Environment]]:
        environments = await self._resolve_project_environments(
            project_id=project_id,
            environment_ids=environment_ids,
        )
        agent = Agent(
            project_id=project_id,
            name=name,
            declared_os=declared_os,
            safe_install=safe_install,
            max_concurrent_tasks=max_concurrent_tasks,
            agent_version=self.agent_versioning_service.resolve_agent_target_version(
                agent_version
            ),
        )
        self.session.add(agent)
        await self.session.flush()
        hosts = []
        if environments:
            hosts = await create_hosts_for_agent(
                self.session,
                agent=agent,
                environment_ids=[environment.id for environment in environments],
            )
        for host in hosts:
            await queue_bootstrap_tasks_for_host(self.session, host=host)
        return agent, environments

    async def update_agent(
        self,
        *,
        agent: Agent,
        name: str | None,
        safe_install: bool | None,
        max_concurrent_tasks: int | None,
        environment_ids: list[str] | None,
        agent_version: str | None,
    ) -> tuple[Agent, list[Environment]]:
        if name:
            agent.name = name
        if safe_install is not None:
            agent.safe_install = safe_install
        if max_concurrent_tasks is not None:
            agent.max_concurrent_tasks = max_concurrent_tasks
        if agent_version is not None:
            agent.agent_version = self.agent_versioning_service.resolve_agent_target_version(
                agent_version
            )
        if environment_ids is not None:
            environments = await self._resolve_project_environments(
                project_id=agent.project_id,
                environment_ids=environment_ids,
            )
            hosts = await sync_hosts_for_agent(
                self.session,
                agent=agent,
                environment_ids=[environment.id for environment in environments],
            )
            for host in hosts:
                await queue_bootstrap_tasks_for_host(self.session, host=host)
        host_rows = list(
            await self.session.scalars(select(Host).where(Host.agent_id == agent.id))
        )
        environments = list(
            await self.session.scalars(
                select(Environment).where(
                    Environment.id.in_([host.environment_id for host in host_rows])
                )
            )
        )
        return agent, environments

    async def delete_agent(self, agent_id: str) -> None:
        agent = await self.session.get(Agent, agent_id)
        if agent is None:
            return
        host_ids = [
            host.id
            for host in await self.session.scalars(
                select(Host).where(Host.agent_id == agent_id)
            )
        ]
        await delete_hosts_and_related(self.session, host_ids=host_ids)

        orphan_task_run_ids = [
            task_run.id
            for task_run in await self.session.scalars(
                select(TaskRun).where(TaskRun.agent_id == agent_id)
            )
        ]
        if orphan_task_run_ids:
            await self.session.execute(
                delete(TaskRunResult).where(
                    TaskRunResult.task_run_id.in_(orphan_task_run_ids)
                )
            )
            await self.session.execute(
                delete(TaskRun).where(TaskRun.id.in_(orphan_task_run_ids))
            )
        await self.session.execute(
            delete(AgentBootstrapToken).where(AgentBootstrapToken.agent_id == agent_id)
        )
        await self.session.delete(agent)

    async def delete_host(self, host_id: str) -> None:
        host = await self.session.get(Host, host_id)
        if host is None:
            return
        await delete_hosts_and_related(self.session, host_ids=[host_id])

    async def issue_install_script(
        self,
        *,
        agent: Agent,
    ) -> tuple[str, str, str]:
        target_version = self.agent_versioning_service.normalize_agent_version(agent)
        self.agent_versioning_service.ensure_artifact_version_available(target_version)
        _, raw_token = await issue_bootstrap_token(self.session, agent_id=agent.id)
        return agent.id, raw_token, target_version

    async def list_agent_task_runs(self, agent_id: str) -> list[TaskRun]:
        return list(
            await self.session.scalars(
                select(TaskRun)
                .where(TaskRun.agent_id == agent_id)
                .order_by(TaskRun.queued_at.desc())
            )
        )

    async def list_host_telemetry(self, host_id: str) -> list[TelemetryRecord]:
        return list(
            await self.session.scalars(
                select(TelemetryRecord)
                .where(TelemetryRecord.host_id == host_id)
                .order_by(TelemetryRecord.collected_at.desc())
            )
        )

    async def list_host_metrics(self, host_id: str) -> list[MetricSnapshot]:
        return list(
            await self.session.scalars(
                select(MetricSnapshot)
                .where(MetricSnapshot.host_id == host_id)
                .order_by(MetricSnapshot.computed_at.desc())
            )
        )

    async def list_task_templates(self, project_id: str) -> list[TaskTemplate]:
        await ensure_project_templates(self.session, project_id)
        return list(
            await self.session.scalars(
                select(TaskTemplate)
                .where(TaskTemplate.project_id == project_id)
                .order_by(TaskTemplate.created_at.asc())
            )
        )

    async def list_schedule_rules(self, environment_id: str):
        from hack_backend.core.models import ScheduleRule

        return list(
            await self.session.scalars(
                select(ScheduleRule)
                .options(joinedload(ScheduleRule.task_template))
                .where(ScheduleRule.environment_id == environment_id)
                .order_by(ScheduleRule.created_at.desc())
            )
        )

    async def create_schedule_rule(
        self,
        *,
        environment_id: str,
        task_template_id: str,
        name: str | None,
        cron_expr: str,
        target_selector_json: dict | None,
        is_enabled: bool = True,
    ):
        from hack_backend.core.models import ScheduleRule
        from hack_backend.core.platform_ops import next_cron_run, utcnow

        _, task_template = await self._resolve_environment_task_template(
            environment_id=environment_id,
            task_template_id=task_template_id,
        )
        normalized_target_selector = await self._normalize_schedule_target_selector(
            environment_id=environment_id,
            task_template=task_template,
            target_selector_json=target_selector_json,
        )
        rule = ScheduleRule(
            environment_id=environment_id,
            task_template_id=task_template.id,
            name=(name or "").strip() or None,
            cron_expr=cron_expr,
            target_selector_json=normalized_target_selector,
            is_enabled=is_enabled,
            next_run_at=next_cron_run(cron_expr, utcnow()),
        )
        self.session.add(rule)
        await self.session.flush()
        rule.task_template = task_template
        return rule

    async def get_schedule_rule(self, schedule_rule_id: str):
        from hack_backend.core.models import ScheduleRule

        return await self.session.scalar(
            select(ScheduleRule)
            .options(joinedload(ScheduleRule.task_template))
            .where(ScheduleRule.id == schedule_rule_id)
        )

    async def patch_schedule_rule(
        self,
        schedule_rule_id: str,
        *,
        task_template_id: str | None = None,
        name: str | None = None,
        replace_name: bool = False,
        is_enabled: bool | None = None,
        cron_expr: str | None = None,
        target_selector_json: dict | None = None,
        replace_target_selector: bool = False,
    ):
        from hack_backend.core.models import ScheduleRule
        from hack_backend.core.platform_ops import next_cron_run, utcnow

        rule = await self.get_schedule_rule(schedule_rule_id)
        if rule is None:
            raise HTTPException(status_code=404, detail="Schedule rule not found")
        task_template = rule.task_template
        if task_template_id is not None:
            _, task_template = await self._resolve_environment_task_template(
                environment_id=rule.environment_id,
                task_template_id=task_template_id,
            )
            rule.task_template_id = task_template.id
            rule.task_template = task_template
        if replace_name:
            rule.name = (name or "").strip() or None
        if is_enabled is not None:
            rule.is_enabled = is_enabled
        if cron_expr is not None:
            rule.cron_expr = cron_expr
            rule.next_run_at = next_cron_run(cron_expr, utcnow())
        if replace_target_selector or task_template_id is not None:
            rule.target_selector_json = await self._normalize_schedule_target_selector(
                environment_id=rule.environment_id,
                task_template=task_template,
                target_selector_json=target_selector_json
                if target_selector_json is not None
                else rule.target_selector_json,
            )
        await self.session.flush()
        return await self.get_schedule_rule(schedule_rule_id)

    async def delete_schedule_rule(self, schedule_rule_id: str) -> None:
        from hack_backend.core.models import ScheduleRule

        rule = await self.session.get(ScheduleRule, schedule_rule_id)
        if rule is not None:
            await self.session.execute(
                update(TaskRun)
                .where(TaskRun.schedule_rule_id == schedule_rule_id)
                .values(schedule_rule_id=None)
            )
            await self.session.delete(rule)
            await self.session.flush()

    async def create_task_runs(
        self,
        *,
        environment_id: str,
        host_ids: list[str],
        task_template_id: str,
        payload_overrides: dict | None,
    ) -> list[TaskRun]:
        environment, task_template = await self._resolve_environment_task_template(
            environment_id=environment_id,
            task_template_id=task_template_id,
        )
        validated_payload_overrides = dict(payload_overrides or {})
        if task_template.kind == "diagnostic.command.custom":
            command = validated_payload_overrides.get("approved_command")
            if not isinstance(command, str) or not command.strip():
                raise HTTPException(
                    status_code=400,
                    detail="Custom command tasks require a non-empty approved_command",
                )
            validated_payload_overrides["approved_command"] = command.strip()
        elif "approved_command" in validated_payload_overrides:
            raise HTTPException(
                status_code=400,
                detail="approved_command override is only allowed for custom command tasks",
            )
        if task_template.kind == "agent.self_update":
            artifact_url = validated_payload_overrides.get("artifact_url")
            if artifact_url is not None:
                if not isinstance(artifact_url, str) or not artifact_url.strip():
                    raise HTTPException(
                        status_code=400,
                        detail="artifact_url override must be a non-empty string",
                    )
                validated_payload_overrides["artifact_url"] = artifact_url.strip()
        resolved_host_ids = list(dict.fromkeys(host_ids))
        hosts = list(
            await self.session.scalars(
                select(Host).where(
                    Host.environment_id == environment_id,
                    Host.id.in_(resolved_host_ids),
                )
            )
        )
        if len(hosts) != len(resolved_host_ids):
            raise HTTPException(status_code=400, detail="Some hosts are invalid")

        task_runs: list[TaskRun] = []
        if task_template.kind == "agent.self_update":
            selected_hosts = list({host.agent_id: host for host in hosts}.values())
        else:
            selected_hosts = hosts

        for host in selected_hosts:
            task_payload_overrides = dict(validated_payload_overrides)
            if task_template.kind == "agent.self_update":
                agent = await self.session.get(Agent, host.agent_id)
                if agent is None:
                    raise HTTPException(status_code=404, detail="Agent not found")
                requested_version = task_payload_overrides.get("version")
                if requested_version is not None:
                    if (
                        not isinstance(requested_version, str)
                        or not requested_version.strip()
                    ):
                        raise HTTPException(
                            status_code=400,
                            detail="version override must be a non-empty string",
                        )
                    requested_version = requested_version.strip()
                artifact_url = task_payload_overrides.get("artifact_url")
                if artifact_url is not None and not isinstance(artifact_url, str):
                    raise HTTPException(
                        status_code=400,
                        detail="artifact_url override must be a string",
                    )
                from_version, target_version = (
                    self.agent_versioning_service.resolve_self_update_versions(
                        agent=agent,
                        requested_version=requested_version,
                        artifact_url=artifact_url,
                    )
                )
                task_payload_overrides["from_version"] = from_version
                task_payload_overrides["version"] = target_version
            task_run = TaskRun(
                environment_id=environment.id,
                host_id=host.id,
                agent_id=host.agent_id,
                task_template_id=task_template_id,
                payload_override_json=task_payload_overrides,
            )
            self.session.add(task_run)
            task_runs.append(task_run)
        await self.session.flush()
        return list(
            await self.session.scalars(
                select(TaskRun)
                .options(
                    selectinload(TaskRun.task_template),
                    selectinload(TaskRun.host),
                    selectinload(TaskRun.agent),
                )
                .where(TaskRun.id.in_([task_run.id for task_run in task_runs]))
            )
        )
