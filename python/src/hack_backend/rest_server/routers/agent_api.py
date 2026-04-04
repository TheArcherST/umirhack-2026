from __future__ import annotations

from typing import Any

from dishka import FromDishka
from dishka.integrations.fastapi import inject
from fastapi import APIRouter
from pydantic import BaseModel, Field

from hack_backend.core.services.agent_runtime_service import (
    AgentRuntimeService,
    LEASE_SECONDS,
)
from hack_backend.core.services.uow_ctl import UoWCtl
from hack_backend.rest_server.schemas.platform import AgentTaskLeaseDTO
from hack_backend.rest_server.providers import CurrentAgent

router = APIRouter(prefix="/agent", tags=["agent-api"])

LEASE_SECONDS = 60


class AgentRegisterPayload(BaseModel):
    bootstrap_token: str
    agent_version: str | None = None
    declared_os: str | None = None
    capabilities_json: dict[str, Any] = Field(default_factory=dict)


class AgentRegisterResponse(BaseModel):
    agent_id: str
    registration_token: str
    poll_interval_seconds: int
    lease_duration_seconds: int


class AgentHeartbeatPayload(BaseModel):
    agent_version: str | None = None
    capabilities_json: dict[str, Any] = Field(default_factory=dict)


class AgentPollPayload(BaseModel):
    limit: int = Field(default=32, ge=1, le=128)


class RunningPayload(BaseModel):
    lease_token: str


class CompletePayload(BaseModel):
    lease_token: str
    status: str
    exit_code: int | None = None
    stdout_text: str | None = None
    stderr_text: str | None = None
    summary_json: dict[str, Any] | None = None
    telemetry_kind: str | None = None
    telemetry_payload: dict[str, Any] | None = None
    failure_reason: str | None = None


@router.post("/register", response_model=AgentRegisterResponse)
@inject
async def register_agent(
    payload: AgentRegisterPayload,
    runtime_service: FromDishka[AgentRuntimeService],
    uow_ctl: FromDishka[UoWCtl],
) -> AgentRegisterResponse:
    agent, registration_token = await runtime_service.register(
        bootstrap_token=payload.bootstrap_token,
        agent_version=payload.agent_version,
        declared_os=payload.declared_os,
        capabilities_json=payload.capabilities_json,
    )
    await uow_ctl.commit()
    return AgentRegisterResponse(
        agent_id=agent.id,
        registration_token=registration_token,
        poll_interval_seconds=5,
        lease_duration_seconds=LEASE_SECONDS,
    )


@router.post("/heartbeat")
@inject
async def heartbeat(
    payload: AgentHeartbeatPayload,
    runtime_service: FromDishka[AgentRuntimeService],
    uow_ctl: FromDishka[UoWCtl],
    agent: FromDishka[CurrentAgent],
) -> dict[str, str]:
    await runtime_service.heartbeat(
        agent=agent,
        agent_version=payload.agent_version,
        capabilities_json=payload.capabilities_json,
    )
    await uow_ctl.commit()
    return {"status": "ok"}


@router.post("/poll", response_model=list[AgentTaskLeaseDTO])
@inject
async def poll_tasks(
    payload: AgentPollPayload,
    runtime_service: FromDishka[AgentRuntimeService],
    uow_ctl: FromDishka[UoWCtl],
    agent: FromDishka[CurrentAgent],
) -> list[AgentTaskLeaseDTO]:
    results = await runtime_service.poll(agent=agent, limit=payload.limit)
    await uow_ctl.commit()
    return results


@router.post("/task-runs/{task_run_id}/running")
@inject
async def mark_task_running(
    task_run_id: str,
    payload: RunningPayload,
    runtime_service: FromDishka[AgentRuntimeService],
    uow_ctl: FromDishka[UoWCtl],
    agent: FromDishka[CurrentAgent],
) -> dict[str, str]:
    await runtime_service.mark_running(
        agent=agent,
        task_run_id=task_run_id,
        lease_token=payload.lease_token,
    )
    await uow_ctl.commit()
    return {"status": "ok"}


@router.post("/task-runs/{task_run_id}/complete")
@inject
async def complete_task(
    task_run_id: str,
    payload: CompletePayload,
    runtime_service: FromDishka[AgentRuntimeService],
    uow_ctl: FromDishka[UoWCtl],
    agent: FromDishka[CurrentAgent],
) -> dict[str, str]:
    await runtime_service.complete(
        agent=agent,
        task_run_id=task_run_id,
        lease_token=payload.lease_token,
        status=payload.status,
        exit_code=payload.exit_code,
        stdout_text=payload.stdout_text,
        stderr_text=payload.stderr_text,
        summary_json=payload.summary_json,
        telemetry_kind=payload.telemetry_kind,
        telemetry_payload=payload.telemetry_payload,
        failure_reason=payload.failure_reason,
    )
    await uow_ctl.commit()
    return {"status": "ok"}
