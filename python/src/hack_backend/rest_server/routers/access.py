from __future__ import annotations

from dishka import FromDishka
from dishka.integrations.fastapi import inject
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.exc import IntegrityError

from hack_backend.core.services.access import (
    AccessService,
    ErrorEmailAlreadyExists,
    ErrorEmailNotVerified,
    ErrorUsernameAlreadyExists,
    ErrorUnauthorized,
)
from hack_backend.core.services.email_verification import EmailVerificationService
from hack_backend.core.services.uow_ctl import UoWCtl
from hack_backend.rest_server.providers import AuthorizedUser

router = APIRouter(tags=["access"])


class LoginCredentials(BaseModel):
    username: str
    password: str


class AuthUserDTO(BaseModel):
    id: str
    email: str
    name: str


class AuthorizationCredentials(BaseModel):
    token: str
    user: AuthUserDTO


class Register(BaseModel):
    username: str
    password: str
    email: EmailStr | None = None


class RegisterResponse(BaseModel):
    message: str
    email_verification_required: bool = False
    auth: AuthorizationCredentials | None = None


class UserSearchResultDTO(BaseModel):
    user_id: str
    email: str
    name: str


def auth_response_for_user_token(
    *,
    user_id: int,
    username: str,
    email: str | None,
    token: str,
) -> AuthorizationCredentials:
    return AuthorizationCredentials(
        token=token,
        user=AuthUserDTO(
            id=str(user_id),
            email=email or username,
            name=username,
        ),
    )


@router.post("/register", status_code=201, response_model=RegisterResponse)
@inject
async def register(
    payload: Register,
    access_service: FromDishka[AccessService],
    email_verification_service: FromDishka[EmailVerificationService],
    uow_ctl: FromDishka[UoWCtl],
    user_agent: str | None = Header(default=None, alias="User-Agent"),
    request_ip: str | None = Header(default=None, alias="X-Forwarded-For"),
) -> RegisterResponse:
    try:
        user = await access_service.register(
            username=payload.username,
            password=payload.password,
            email=payload.email,
        )
    except ErrorEmailAlreadyExists as exc:
        await uow_ctl.rollback()
        raise HTTPException(
            status_code=409,
            detail="User with this email already exists",
        ) from exc
    except ErrorUsernameAlreadyExists as exc:
        await uow_ctl.rollback()
        raise HTTPException(status_code=409, detail="Username already exists") from exc
    except IntegrityError as exc:
        await uow_ctl.rollback()
        raise HTTPException(status_code=409, detail="Username already exists") from exc

    user.email_verified = payload.email is None
    auth: AuthorizationCredentials | None = None
    if payload.email is not None:
        await email_verification_service.send_verification_code(
            user,
            request_ip=(request_ip or "unknown").split(",")[0].strip() or "unknown",
            user_agent=user_agent or "unknown",
        )
    else:
        login_session = await access_service.create_login_session(
            user=user,
            user_agent=user_agent,
        )
        auth = auth_response_for_user_token(
            user_id=user.id,
            username=user.username,
            email=user.email,
            token=login_session.token,
        )
    await uow_ctl.commit()

    return RegisterResponse(
        message="User registered successfully",
        email_verification_required=payload.email is not None,
        auth=auth,
    )


@router.post("/login", status_code=201, response_model=AuthorizationCredentials)
@inject
async def login(
    payload: LoginCredentials,
    access_service: FromDishka[AccessService],
    uow_ctl: FromDishka[UoWCtl],
    user_agent: str | None = Header(default=None, alias="User-Agent"),
) -> AuthorizationCredentials:
    try:
        login_session = await access_service.login(
            username=payload.username,
            password=payload.password,
            user_agent=user_agent,
        )
    except ErrorUnauthorized as exc:
        raise HTTPException(
            status_code=401,
            detail="Invalid username or password",
        ) from exc
    except ErrorEmailNotVerified as exc:
        raise HTTPException(
            status_code=403,
            detail="Email is not verified",
        ) from exc

    await uow_ctl.commit()

    return auth_response_for_user_token(
        user_id=login_session.user.id,
        username=login_session.user.username,
        email=login_session.user.email,
        token=login_session.token,
    )


@router.get("/users/search", response_model=list[UserSearchResultDTO])
@inject
async def search_users(
    q: str,
    current_user: FromDishka[AuthorizedUser],
    access_service: FromDishka[AccessService],
) -> list[UserSearchResultDTO]:
    users = await access_service.search_users(
        query=q,
        exclude_user_id=current_user.id,
    )
    return [
        UserSearchResultDTO(
            user_id=str(user.id),
            email=user.email or "",
            name=user.username,
        )
        for user in users
    ]
