from uuid import UUID

from dishka import FromDishka
from dishka.integrations.fastapi import inject
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from hack_backend.core.services.access import AccessService, ErrorUnauthorized
from hack_backend.core.services.uow_ctl import UoWCtl

router = APIRouter(
    prefix="",
)


class LoginCredentials(BaseModel):
    username: str
    password: str


class AuthorizationCredentials(BaseModel):
    login_session_uid: UUID
    login_session_token: str


class Register(BaseModel):
    username: str
    password: str


@router.post(
    "/register",
    status_code=201,
)
@inject
async def register(
    access_service: FromDishka[AccessService],
    uow_ctl: FromDishka[UoWCtl],
    payload: Register,
) -> None:
    await access_service.register(
        username=payload.username,
        password=payload.password,
    )
    await uow_ctl.commit()
    return None


@router.post(
    "/login",
    status_code=201,
)
@inject
async def login(
    access_service: FromDishka[AccessService],
    uow_ctl: FromDishka[UoWCtl],
    payload: LoginCredentials,
) -> AuthorizationCredentials:
    try:
        login_session = await access_service.login(
            username=payload.username,
            password=payload.password,
            user_agent="none",
        )
    except ErrorUnauthorized as e:
        raise HTTPException(
            status_code=401,
            detail="Invalid username or password",
        ) from e

    await uow_ctl.commit()
    return AuthorizationCredentials(
        login_session_uid=login_session.uid,
        login_session_token=login_session.token,
    )
