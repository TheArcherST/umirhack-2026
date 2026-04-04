from __future__ import annotations

from dishka import FromDishka
from dishka.integrations.fastapi import inject
from fastapi import APIRouter
from pydantic import BaseModel

from hack_backend.core.models import User
from hack_backend.core.services.platform_service import PlatformService
from hack_backend.core.services.uow_ctl import UoWCtl
from hack_backend.rest_server.dependencies import require_environment_member, require_project_member
from hack_backend.rest_server.providers import AuthorizedUser
from hack_backend.rest_server.schemas.platform import (
    EnvironmentDTO,
    EnvironmentMemberDTO,
    GraphEdgeDTO,
    HostListDTO,
    TaskRunDTO,
)
from hack_backend.rest_server.serializers import (
    environment_member_to_dto,
    environment_to_dto,
    graph_edge_to_dto,
    host_list_to_dto,
    task_run_to_dto,
)

router = APIRouter(tags=["environments"])


class CreateEnvironmentPayload(BaseModel):
    name: str
    project_id: str


class UpdateEnvironmentRolePayload(BaseModel):
    role: str


@router.get("/environments", response_model=list[EnvironmentDTO])
@inject
async def list_environments(
    project_id: str,
    current_user: FromDishka[AuthorizedUser],
    platform_service: FromDishka[PlatformService],
) -> list[EnvironmentDTO]:
    await require_project_member(
        project_id,
        session=platform_service.session,
        user_id=current_user.id,
    )
    environments = await platform_service.list_environments(project_id)
    return [environment_to_dto(environment) for environment in environments]


@router.post("/environments", status_code=201, response_model=EnvironmentDTO)
@inject
async def create_environment(
    payload: CreateEnvironmentPayload,
    current_user: FromDishka[AuthorizedUser],
    platform_service: FromDishka[PlatformService],
    uow_ctl: FromDishka[UoWCtl],
) -> EnvironmentDTO:
    await require_project_member(
        payload.project_id,
        session=platform_service.session,
        user_id=current_user.id,
    )
    environment = await platform_service.create_environment(
        project_id=payload.project_id,
        creator_id=current_user.id,
        name=payload.name,
    )
    await uow_ctl.commit()
    return environment_to_dto(environment)


@router.get(
    "/environments/{environment_id}/members",
    response_model=list[EnvironmentMemberDTO],
)
@inject
async def list_environment_members(
    environment_id: str,
    current_user: FromDishka[AuthorizedUser],
    platform_service: FromDishka[PlatformService],
) -> list[EnvironmentMemberDTO]:
    await require_environment_member(
        environment_id,
        session=platform_service.session,
        user_id=current_user.id,
    )
    members = await platform_service.list_environment_members(environment_id)
    return [environment_member_to_dto(member) for member in members]


@router.post(
    "/environments/{environment_id}/members/{user_id}/role",
    response_model=EnvironmentMemberDTO,
)
@inject
async def assign_environment_role(
    environment_id: str,
    user_id: int,
    payload: UpdateEnvironmentRolePayload,
    current_user: FromDishka[AuthorizedUser],
    platform_service: FromDishka[PlatformService],
    uow_ctl: FromDishka[UoWCtl],
) -> EnvironmentMemberDTO:
    await require_environment_member(
        environment_id,
        session=platform_service.session,
        user_id=current_user.id,
    )
    member = await platform_service.assign_environment_role(
        environment_id=environment_id,
        user_id=user_id,
        role=payload.role,
    )
    await uow_ctl.commit()
    return environment_member_to_dto(member)


@router.get("/environments/{environment_id}/hosts", response_model=list[HostListDTO])
@inject
async def list_environment_hosts(
    environment_id: str,
    current_user: FromDishka[AuthorizedUser],
    platform_service: FromDishka[PlatformService],
) -> list[HostListDTO]:
    await require_environment_member(
        environment_id,
        session=platform_service.session,
        user_id=current_user.id,
    )
    hosts, agents = await platform_service.list_environment_hosts(environment_id)
    return [
        host_list_to_dto(host, agent=agents[host.agent_id])
        for host in hosts
        if host.agent_id in agents
    ]


@router.get("/environments/{environment_id}/graph", response_model=list[GraphEdgeDTO])
@inject
async def list_environment_graph(
    environment_id: str,
    current_user: FromDishka[AuthorizedUser],
    platform_service: FromDishka[PlatformService],
) -> list[GraphEdgeDTO]:
    await require_environment_member(
        environment_id,
        session=platform_service.session,
        user_id=current_user.id,
    )
    edges = await platform_service.list_environment_graph(environment_id)
    return [graph_edge_to_dto(edge) for edge in edges]


@router.get(
    "/environments/{environment_id}/task-runs",
    response_model=list[TaskRunDTO],
)
@inject
async def list_environment_task_runs(
    environment_id: str,
    current_user: FromDishka[AuthorizedUser],
    platform_service: FromDishka[PlatformService],
) -> list[TaskRunDTO]:
    await require_environment_member(
        environment_id,
        session=platform_service.session,
        user_id=current_user.id,
    )
    task_runs = await platform_service.list_environment_task_runs(environment_id)
    return [task_run_to_dto(task_run) for task_run in task_runs]
