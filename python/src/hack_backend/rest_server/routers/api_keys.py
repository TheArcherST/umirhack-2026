from __future__ import annotations

import datetime
from datetime import UTC, timedelta

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from hack_backend.core.models.enums import ApiKeyRole
from hack_backend.core.security import hash_secret, new_secret
from hack_backend.db import async_session_maker
from hack_backend.rest_server.providers import AuthorizedUser, FromDishka, inject

router = APIRouter(prefix="/environments/{environment_id}/api-keys", tags=["api-keys"])

EXPIRY_OPTIONS = {
    "1d": lambda: datetime.datetime.now(tz=UTC) + timedelta(days=1),
    "7d": lambda: datetime.datetime.now(tz=UTC) + timedelta(days=7),
    "30d": lambda: datetime.datetime.now(tz=UTC) + timedelta(days=30),
    "90d": lambda: datetime.datetime.now(tz=UTC) + timedelta(days=90),
    "never": lambda: None,
}


class ApiKeyCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    role: ApiKeyRole = ApiKeyRole.OPERATOR
    expiry: str = "7d"


class ApiKeyCreateResponse(BaseModel):
    id: str
    name: str
    role: ApiKeyRole
    environment_id: str
    key: str
    expires_at: str | None
    created_at: str


class ApiKeyListItem(BaseModel):
    id: str
    name: str
    role: ApiKeyRole
    created_by: str
    expires_at: str | None
    revoked_at: str | None
    created_at: str
    is_active: bool


class ApiKeyListResponse(BaseModel):
    keys: list[ApiKeyListItem]


@router.get("", response_model=ApiKeyListResponse)
@inject
async def list_api_keys(
    environment_id: str,
    current_user: FromDishka[AuthorizedUser],
) -> ApiKeyListResponse:
    from sqlalchemy import select
    from sqlalchemy.orm import joinedload
    from hack_backend.core.models import ApiKey

    async with async_session_maker() as session:
        # Check project membership first
        from hack_backend.core.services.access import AccessService
        from argon2 import PasswordHasher

        access_service = AccessService(session, PasswordHasher())
        await access_service.require_environment_member(
            environment_id, user_id=current_user.id
        )

        result = await session.scalars(
            select(ApiKey)
            .where(ApiKey.environment_id == environment_id)
            .order_by(ApiKey.created_at.desc())
        )
        keys = result.all()

        items = []
        for key in keys:
            items.append(
                ApiKeyListItem(
                    id=key.id,
                    name=key.name,
                    role=key.role,
                    created_by=key.creator.username if key.creator else "unknown",
                    expires_at=key.expires_at.isoformat() if key.expires_at else None,
                    revoked_at=key.revoked_at.isoformat() if key.revoked_at else None,
                    created_at=key.created_at.isoformat() if key.created_at else "",
                    is_active=key.is_active,
                )
            )

        return ApiKeyListResponse(keys=items)


@router.post("", response_model=ApiKeyCreateResponse)
@inject
async def create_api_key(
    environment_id: str,
    body: ApiKeyCreateRequest,
    current_user: FromDishka[AuthorizedUser],
) -> ApiKeyCreateResponse:
    from sqlalchemy import select
    from sqlalchemy.orm import joinedload
    from hack_backend.core.models import ApiKey

    if body.expiry not in EXPIRY_OPTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid expiry. Must be one of: {', '.join(EXPIRY_OPTIONS.keys())}",
        )

    async with async_session_maker() as session:
        # Check project membership first
        from hack_backend.core.services.access import AccessService
        from argon2 import PasswordHasher

        access_service = AccessService(session, PasswordHasher())
        await access_service.require_environment_member(
            environment_id, user_id=current_user.id
        )

        # Generate raw key
        raw_key = new_secret(48)
        key_hash = hash_secret(raw_key)

        expires_at = EXPIRY_OPTIONS[body.expiry]()

        api_key = ApiKey(
            key_hash=key_hash,
            name=body.name,
            environment_id=environment_id,
            role=body.role,
            created_by=current_user.id,
            expires_at=expires_at,
        )
        session.add(api_key)
        await session.flush()
        await session.refresh(api_key)

        return ApiKeyCreateResponse(
            id=api_key.id,
            name=api_key.name,
            role=api_key.role,
            environment_id=api_key.environment_id,
            key=raw_key,  # Only time the raw key is returned
            expires_at=api_key.expires_at.isoformat() if api_key.expires_at else None,
            created_at=api_key.created_at.isoformat() if api_key.created_at else "",
        )


@router.post("/{key_id}/revoke")
@inject
async def revoke_api_key(
    environment_id: str,
    key_id: str,
    current_user: FromDishka[AuthorizedUser],
) -> dict:
    from hack_backend.core.models import ApiKey

    async with async_session_maker() as session:
        from hack_backend.core.services.access import AccessService
        from argon2 import PasswordHasher

        access_service = AccessService(session, PasswordHasher())
        await access_service.require_environment_member(
            environment_id, user_id=current_user.id
        )

        api_key = await session.get(ApiKey, key_id)
        if api_key is None or api_key.environment_id != environment_id:
            raise HTTPException(status_code=404, detail="API key not found")

        if api_key.revoked_at is not None:
            raise HTTPException(status_code=400, detail="API key already revoked")

        api_key.revoked_at = datetime.datetime.now(tz=UTC)
        await session.flush()

        return {"status": "revoked"}


@router.delete("/{key_id}")
@inject
async def delete_api_key(
    environment_id: str,
    key_id: str,
    current_user: FromDishka[AuthorizedUser],
) -> dict:
    from hack_backend.core.models import ApiKey

    async with async_session_maker() as session:
        from hack_backend.core.services.access import AccessService
        from argon2 import PasswordHasher

        access_service = AccessService(session, PasswordHasher())
        await access_service.require_environment_member(
            environment_id, user_id=current_user.id
        )

        api_key = await session.get(ApiKey, key_id)
        if api_key is None or api_key.environment_id != environment_id:
            raise HTTPException(status_code=404, detail="API key not found")

        await session.delete(api_key)
        await session.flush()

        return {"status": "deleted"}
