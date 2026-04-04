from __future__ import annotations

from dishka import FromDishka
from dishka.integrations.fastapi import inject
from fastapi import APIRouter
from pydantic import BaseModel, EmailStr

from hack_backend.core.models import User
from hack_backend.core.services.platform_service import PlatformService
from hack_backend.core.services.uow_ctl import UoWCtl
from hack_backend.rest_server.dependencies import require_project_member
from hack_backend.rest_server.providers import AuthorizedUser
from hack_backend.rest_server.schemas.platform import ProjectDTO, ProjectMemberDTO
from hack_backend.rest_server.serializers import (
    project_member_to_dto,
    project_to_dto,
)

router = APIRouter(tags=["projects"])


class CreateProjectPayload(BaseModel):
    name: str


class InviteMemberPayload(BaseModel):
    email: EmailStr


class UpdateProjectRolePayload(BaseModel):
    role: str


@router.get("/projects", response_model=list[ProjectDTO])
@inject
async def list_projects(
    current_user: FromDishka[AuthorizedUser],
    platform_service: FromDishka[PlatformService],
) -> list[ProjectDTO]:
    projects = await platform_service.list_projects_for_user(current_user)
    return [project_to_dto(project) for project in projects]


@router.post("/projects", status_code=201, response_model=ProjectDTO)
@inject
async def create_project(
    payload: CreateProjectPayload,
    current_user: FromDishka[AuthorizedUser],
    platform_service: FromDishka[PlatformService],
    uow_ctl: FromDishka[UoWCtl],
) -> ProjectDTO:
    project = await platform_service.create_project(owner=current_user, name=payload.name)
    await uow_ctl.commit()
    return project_to_dto(project)


@router.get("/projects/{project_id}/members", response_model=list[ProjectMemberDTO])
@inject
async def list_project_members(
    project_id: str,
    current_user: FromDishka[AuthorizedUser],
    platform_service: FromDishka[PlatformService],
) -> list[ProjectMemberDTO]:
    await require_project_member(
        project_id,
        session=platform_service.session,
        user_id=current_user.id,
    )
    rows = await platform_service.list_project_members(project_id)
    return [project_member_to_dto(member, user) for member, user in rows]


@router.post(
    "/projects/{project_id}/members/invite",
    status_code=201,
    response_model=ProjectMemberDTO,
)
@inject
async def invite_project_member(
    project_id: str,
    payload: InviteMemberPayload,
    current_user: FromDishka[AuthorizedUser],
    platform_service: FromDishka[PlatformService],
    uow_ctl: FromDishka[UoWCtl],
) -> ProjectMemberDTO:
    await require_project_member(
        project_id,
        session=platform_service.session,
        user_id=current_user.id,
    )
    membership, user = await platform_service.invite_project_member(
        project_id,
        str(payload.email),
    )
    await uow_ctl.commit()
    return project_member_to_dto(membership, user)


@router.delete("/projects/{project_id}/members/{user_id}", status_code=204)
@inject
async def remove_project_member(
    project_id: str,
    user_id: int,
    current_user: FromDishka[AuthorizedUser],
    platform_service: FromDishka[PlatformService],
    uow_ctl: FromDishka[UoWCtl],
) -> None:
    project = await require_project_member(
        project_id,
        session=platform_service.session,
        user_id=current_user.id,
    )
    await platform_service.remove_project_member(project=project, user_id=user_id)
    await uow_ctl.commit()


@router.put(
    "/projects/{project_id}/members/{user_id}/role",
    response_model=ProjectMemberDTO,
)
@inject
async def update_project_role(
    project_id: str,
    user_id: int,
    payload: UpdateProjectRolePayload,
    current_user: FromDishka[AuthorizedUser],
    platform_service: FromDishka[PlatformService],
    uow_ctl: FromDishka[UoWCtl],
) -> ProjectMemberDTO:
    await require_project_member(
        project_id,
        session=platform_service.session,
        user_id=current_user.id,
    )
    membership, user = await platform_service.update_project_member_role(
        project_id=project_id,
        user_id=user_id,
        role=payload.role,
    )
    await uow_ctl.commit()
    return project_member_to_dto(membership, user)
