from __future__ import annotations

from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from hack_backend.core.database import get_db_session
from hack_backend.core.models import (
    Environment,
    EnvironmentMember,
    LoginSession,
    Project,
    ProjectMember,
    User,
)


DbSession = AsyncSession


async def get_session(
    session: AsyncSession = Depends(get_db_session),
) -> AsyncSession:
    return session


async def resolve_bearer_login_session(
    *,
    authorization: str | None,
    session: AsyncSession,
) -> LoginSession:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")

    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing bearer token")

    login_session = await session.scalar(
        select(LoginSession)
        .options(joinedload(LoginSession.user))
        .where(LoginSession.token == token)
    )
    if login_session is None:
        raise HTTPException(status_code=401, detail="Invalid bearer token")
    return login_session


async def get_current_user(
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> User:
    login_session = await resolve_bearer_login_session(
        authorization=authorization,
        session=session,
    )
    return login_session.user


async def require_project_member(
    project_id: str,
    *,
    session: AsyncSession,
    user_id: int,
) -> Project:
    project = await session.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    if project.owner_id == user_id:
        return project

    membership = await session.get(
        ProjectMember,
        {"project_id": project_id, "user_id": user_id},
    )
    if membership is None:
        raise HTTPException(status_code=403, detail="Project access denied")
    return project


async def require_environment_member(
    environment_id: str,
    *,
    session: AsyncSession,
    user_id: int,
) -> Environment:
    environment = await session.get(Environment, environment_id)
    if environment is None:
        raise HTTPException(status_code=404, detail="Environment not found")

    project = await require_project_member(
        environment.project_id,
        session=session,
        user_id=user_id,
    )
    if project.owner_id == user_id:
        return environment

    membership = await session.get(
        EnvironmentMember,
        {"environment_id": environment_id, "user_id": user_id},
    )
    if membership is None:
        raise HTTPException(status_code=403, detail="Environment access denied")
    return environment
