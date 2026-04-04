from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from hack_backend.core.models import (
    Agent,
    AgentBootstrapToken,
    Environment,
    EnvironmentMember,
    GraphEdge,
    Host,
    MetricSnapshot,
    Project,
    ProjectMember,
    TaskRun,
    TaskRunResult,
    TaskTemplate,
    TelemetryRecord,
    User,
)
from hack_backend.core.platform_ops import (
    create_hosts_for_agent,
    create_project_defaults,
    ensure_project_templates,
    is_graph_edge_stale,
    issue_bootstrap_token,
    queue_bootstrap_tasks_for_host,
    refresh_agent_state,
    sync_hosts_for_agent,
)
from hack_backend.core.security import new_secret, password_hasher


@dataclass(slots=True)
class PlatformService:
    session: AsyncSession

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
                role="member",
                invite_status="pending",
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
        membership.role = "admin" if role == "admin" else "member"
        membership.invite_status = "accepted"
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
        self.session.add(
            EnvironmentMember(
                environment_id=environment.id,
                user_id=creator_id,
                role="operator",
            )
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
        environment_ids: list[str],
    ) -> tuple[Agent, list[Environment]]:
        environments = await self._resolve_project_environments(
            project_id=project_id,
            environment_ids=environment_ids,
        )
        agent = Agent(
            project_id=project_id,
            name=name,
            declared_os=declared_os,
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
        environment_ids: list[str] | None,
    ) -> tuple[Agent, list[Environment]]:
        if name:
            agent.name = name
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
        if host_ids:
            await self.session.execute(
                delete(GraphEdge).where(GraphEdge.source_host_id.in_(host_ids))
            )
            await self.session.execute(
                delete(GraphEdge).where(GraphEdge.target_host_id.in_(host_ids))
            )
            await self.session.execute(
                delete(MetricSnapshot).where(MetricSnapshot.host_id.in_(host_ids))
            )
            await self.session.execute(
                delete(TelemetryRecord).where(TelemetryRecord.host_id.in_(host_ids))
            )
            await self.session.execute(delete(Host).where(Host.id.in_(host_ids)))

        task_run_ids = [
            task_run.id
            for task_run in await self.session.scalars(
                select(TaskRun).where(TaskRun.agent_id == agent_id)
            )
        ]
        if task_run_ids:
            await self.session.execute(
                delete(TaskRunResult).where(TaskRunResult.task_run_id.in_(task_run_ids))
            )
        await self.session.execute(delete(TaskRun).where(TaskRun.agent_id == agent_id))
        await self.session.execute(
            delete(AgentBootstrapToken).where(AgentBootstrapToken.agent_id == agent_id)
        )
        await self.session.delete(agent)

    async def issue_install_script(
        self,
        *,
        agent: Agent,
    ) -> tuple[str, str]:
        _, raw_token = await issue_bootstrap_token(self.session, agent_id=agent.id)
        return agent.id, raw_token

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
                .where(ScheduleRule.environment_id == environment_id)
                .order_by(ScheduleRule.created_at.desc())
            )
        )

    async def create_schedule_rule(
        self,
        *,
        environment_id: str,
        task_template_id: str,
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
        rule = ScheduleRule(
            environment_id=environment_id,
            task_template_id=task_template.id,
            cron_expr=cron_expr,
            target_selector_json=target_selector_json or {},
            is_enabled=is_enabled,
            next_run_at=next_cron_run(cron_expr, utcnow()),
        )
        self.session.add(rule)
        await self.session.flush()
        return rule

    async def create_task_runs(
        self,
        *,
        environment_id: str,
        host_ids: list[str],
        task_template_id: str,
        payload_overrides: dict | None,
    ) -> list[TaskRun]:
        environment, _ = await self._resolve_environment_task_template(
            environment_id=environment_id,
            task_template_id=task_template_id,
        )
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
        for host in hosts:
            task_run = TaskRun(
                environment_id=environment.id,
                host_id=host.id,
                agent_id=host.agent_id,
                task_template_id=task_template_id,
                payload_override_json=payload_overrides or {},
            )
            self.session.add(task_run)
            task_runs.append(task_run)
        await self.session.flush()
        return task_runs
