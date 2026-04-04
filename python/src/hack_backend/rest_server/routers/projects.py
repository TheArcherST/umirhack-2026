from __future__ import annotations

from datetime import UTC, datetime, timedelta

from dishka import FromDishka
from dishka.integrations.fastapi import inject
from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy import select

from hack_backend.core.models import Project, ProjectMember, User
from hack_backend.core.models.enums import InviteStatus
from hack_backend.core.providers import ConfigEmail, ConfigServer
from hack_backend.core.security import hash_secret, new_secret, verify_secret
from hack_backend.core.services.platform_service import PlatformService
from hack_backend.core.services.uow_ctl import UoWCtl
from hack_backend.rest_server.dependencies import require_project_member
from hack_backend.rest_server.providers import AuthorizedUser
from hack_backend.rest_server.schemas.platform import ProjectDTO, ProjectMemberDTO
from hack_backend.rest_server.serializers import (
    project_member_to_dto,
    project_to_dto,
)
from hack_backend.tasksd.email_tasks import send_project_invitation_email_task

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
    email_config: FromDishka[ConfigEmail],
    server_config: FromDishka[ConfigServer],
    uow_ctl: FromDishka[UoWCtl],
) -> ProjectMemberDTO:
    await require_project_member(
        project_id,
        session=platform_service.session,
        user_id=current_user.id,
    )
    project = await platform_service.session.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    membership, user = await platform_service.invite_project_member(
        project_id,
        str(payload.email),
    )

    # Generate invite token and attach to membership
    token = new_secret(32)
    membership.invite_token_hash = hash_secret(token)
    membership.invite_expires_at = datetime.now(tz=UTC) + timedelta(
        hours=email_config.invite_validity_hours
    )

    await uow_ctl.commit()

    if user.email:
        base_url = server_config.frontend_url.rstrip("/")
        await send_project_invitation_email_task.kiq(
            email_address=user.email,
            user_name=user.username,
            project_name=project.name,
            invited_by=current_user.username,
            accept_url=f"{base_url}/api/projects/invite/accept?token={token}",
            decline_url=f"{base_url}/api/projects/invite/decline?token={token}",
        )

    return project_member_to_dto(membership, user)


@router.get("/projects/invite/accept")
@inject
async def accept_project_invite(
    token: str,
    platform_service: FromDishka[PlatformService],
    server_config: FromDishka[ConfigServer],
    uow_ctl: FromDishka[UoWCtl],
) -> RedirectResponse:
    membership = await _find_membership_by_token(token, platform_service)
    if membership is None:
        raise HTTPException(status_code=400, detail="Invalid or expired invite link")

    membership.invite_status = InviteStatus.ACCEPTED
    membership.invite_token_hash = None
    membership.invite_expires_at = None
    await uow_ctl.commit()

    redirect_to = server_config.frontend_url.rstrip("/") or "/"
    return RedirectResponse(url=f"{redirect_to}?invite_accepted=1", status_code=302)


@router.get("/projects/invite/decline")
@inject
async def decline_project_invite(
    token: str,
    platform_service: FromDishka[PlatformService],
    server_config: FromDishka[ConfigServer],
    uow_ctl: FromDishka[UoWCtl],
) -> RedirectResponse:
    membership = await _find_membership_by_token(token, platform_service)
    if membership is not None:
        await platform_service.session.delete(membership)
        await uow_ctl.commit()

    redirect_to = server_config.frontend_url.rstrip("/") or "/"
    return RedirectResponse(url=f"{redirect_to}?invite_declined=1", status_code=302)


async def _find_membership_by_token(
    token: str,
    platform_service: PlatformService,
) -> ProjectMember | None:
    token_hash = hash_secret(token)
    membership = await platform_service.session.scalar(
        select(ProjectMember).where(ProjectMember.invite_token_hash == token_hash)
    )
    if membership is None:
        return None
    expires_at = membership.invite_expires_at
    if expires_at is not None:
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=UTC)
        if expires_at <= datetime.now(tz=UTC):
            return None
    return membership


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
