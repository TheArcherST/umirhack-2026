from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import lazyload, selectinload

from hack_backend.core.models import (
    Agent,
    AgentBootstrapToken,
    Host,
    TaskRun,
    TaskRunStatus,
)
from hack_backend.core.platform_ops import (
    ensure_utc,
    merged_payload,
    queue_bootstrap_tasks_for_host,
    refresh_agent_state,
    set_agent_online,
    store_task_result,
    utcnow,
)
from hack_backend.core.security import hash_secret, new_secret, verify_secret
from hack_backend.rest_server.schemas.platform import (
    AgentExecutionHostDTO,
    AgentExecutionTemplateDTO,
    AgentTaskLeaseDTO,
)

LEASE_SECONDS = 60


@dataclass(slots=True)
class AgentRuntimeService:
    session: AsyncSession

    async def authenticate(self, *, agent_id: str, agent_token: str) -> Agent:
        agent = await self.session.get(Agent, agent_id)
        if agent is None or not verify_secret(agent_token, agent.registration_token_hash):
            raise HTTPException(status_code=401, detail="Invalid agent credentials")
        return agent

    async def register(
        self,
        *,
        bootstrap_token: str,
        agent_version: str | None,
        declared_os: str | None,
        capabilities_json: dict[str, Any],
    ) -> tuple[Agent, str]:
        token_hash = hash_secret(bootstrap_token)
        bootstrap = await self.session.scalar(
            select(AgentBootstrapToken).where(
                AgentBootstrapToken.token_hash == token_hash,
                AgentBootstrapToken.revoked_at.is_(None),
            )
        )
        if bootstrap is None:
            raise HTTPException(status_code=401, detail="Invalid bootstrap token")

        agent = await self.session.get(Agent, bootstrap.agent_id)
        if agent is None:
            raise HTTPException(status_code=404, detail="Agent not found")

        registration_token = new_secret(24)
        agent.registration_token_hash = hash_secret(registration_token)
        agent.declared_os = declared_os or agent.declared_os
        await set_agent_online(
            self.session,
            agent=agent,
            agent_version=agent_version,
            capabilities_json=capabilities_json,
        )
        bootstrap.revoked_at = utcnow()

        hosts = list(
            await self.session.scalars(select(Host).where(Host.agent_id == agent.id))
        )
        for host in hosts:
            await queue_bootstrap_tasks_for_host(self.session, host=host)
        return agent, registration_token

    async def heartbeat(
        self,
        *,
        agent: Agent,
        agent_version: str | None,
        capabilities_json: dict[str, Any],
    ) -> None:
        await set_agent_online(
            self.session,
            agent=agent,
            agent_version=agent_version,
            capabilities_json=capabilities_json,
        )

    async def poll(self, *, agent: Agent, limit: int) -> list[AgentTaskLeaseDTO]:
        await refresh_agent_state(self.session)
        lease_until = utcnow() + timedelta(seconds=LEASE_SECONDS)
        task_runs = list(
            await self.session.scalars(
                select(TaskRun)
                .options(
                    lazyload("*"),
                    selectinload(TaskRun.task_template),
                    selectinload(TaskRun.host),
                )
                .where(
                    TaskRun.agent_id == agent.id,
                    TaskRun.status == TaskRunStatus.QUEUED,
                )
                .order_by(TaskRun.queued_at.asc())
                .with_for_update(skip_locked=True)
                .limit(limit)
            )
        )

        leases: list[AgentTaskLeaseDTO] = []
        for task_run in task_runs:
            lease_token = new_secret(18)
            task_run.status = TaskRunStatus.LEASED
            task_run.lease_token = hash_secret(lease_token)
            task_run.leased_until = lease_until
            task_run.attempt_no += 1
            leases.append(
                AgentTaskLeaseDTO(
                    id=task_run.id,
                    environment_id=task_run.environment_id,
                    host_id=task_run.host_id,
                    lease_token=lease_token,
                    lease_until=lease_until,
                    task_template=AgentExecutionTemplateDTO(
                        id=task_run.task_template.id,
                        kind=task_run.task_template.kind,
                        name=task_run.task_template.name,
                        payload_json=merged_payload(task_run.task_template, task_run),
                        approved_command=task_run.task_template.approved_command,
                    ),
                    host=AgentExecutionHostDTO(
                        id=task_run.host.id,
                        name=task_run.host.name,
                        hostname=task_run.host.hostname,
                        primary_ipv4=task_run.host.primary_ipv4,
                        primary_ipv6=task_run.host.primary_ipv6,
                    ),
                )
            )
        return leases

    async def mark_running(
        self,
        *,
        agent: Agent,
        task_run_id: str,
        lease_token: str,
    ) -> None:
        task_run = await self._get_agent_task_run(agent.id, task_run_id)
        self._validate_lease(task_run, lease_token)
        task_run.status = TaskRunStatus.RUNNING
        task_run.started_at = utcnow()

    async def complete(
        self,
        *,
        agent: Agent,
        task_run_id: str,
        lease_token: str,
        status: str,
        exit_code: int | None,
        stdout_text: str | None,
        stderr_text: str | None,
        summary_json: dict[str, Any] | None,
        telemetry_kind: str | None,
        telemetry_payload: dict[str, Any] | None,
        failure_reason: str | None,
    ) -> None:
        task_run = await self._get_agent_task_run(agent.id, task_run_id)
        self._validate_lease(task_run, lease_token)

        status_map = {
            "succeeded": TaskRunStatus.SUCCEEDED,
            "failed": TaskRunStatus.FAILED,
            "cancelled": TaskRunStatus.CANCELLED,
            "expired": TaskRunStatus.EXPIRED,
        }
        resolved_status = status_map.get(status)
        if resolved_status is None:
            raise HTTPException(status_code=400, detail="Unsupported task status")

        await store_task_result(
            self.session,
            task_run=task_run,
            exit_code=exit_code,
            stdout_text=stdout_text,
            stderr_text=stderr_text,
            summary_json=summary_json,
            telemetry_payload=telemetry_payload,
            telemetry_kind=telemetry_kind,
            status=resolved_status,
            failure_reason=failure_reason,
        )
        await set_agent_online(
            self.session,
            agent=agent,
            agent_version=agent.agent_version,
            capabilities_json=agent.capabilities_json,
        )

    async def _get_agent_task_run(self, agent_id: str, task_run_id: str) -> TaskRun:
        task_run = await self.session.get(TaskRun, task_run_id)
        if task_run is None or task_run.agent_id != agent_id:
            raise HTTPException(status_code=404, detail="Task run not found")
        return task_run

    def _validate_lease(self, task_run: TaskRun, lease_token: str) -> None:
        if task_run.status not in {TaskRunStatus.LEASED, TaskRunStatus.RUNNING}:
            raise HTTPException(status_code=409, detail="Task run is not leased")
        if task_run.leased_until is None or ensure_utc(task_run.leased_until) <= utcnow():
            raise HTTPException(status_code=409, detail="Lease expired")
        if not verify_secret(lease_token, task_run.lease_token):
            raise HTTPException(status_code=409, detail="Invalid lease token")
