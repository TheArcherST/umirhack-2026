from uuid import UUID

from dishka import FromDishka
from dishka.integrations.fastapi import inject
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr
from sqlalchemy.exc import IntegrityError

from hack_backend.core.services.access import (
    AccessService,
    ErrorUnauthorized,
    ServiceAccessError,
)
from hack_backend.core.services.email_verification import (
    EmailAlreadyVerified,
    EmailVerificationService,
)
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
    email: EmailStr | None = None


class RegisterResponse(BaseModel):
    message: str
    email_verification_required: bool = False


@router.post(
    "/register",
    status_code=201,
)
@inject
async def register(
    request: Request,
    access_service: FromDishka[AccessService],
    email_service: FromDishka[EmailVerificationService],
    uow_ctl: FromDishka[UoWCtl],
    payload: Register,
) -> RegisterResponse:
    try:
        user = await access_service.register(
            username=payload.username,
            password=payload.password,
            email=payload.email,
        )
    except ServiceAccessError as e:
        await uow_ctl.rollback()
        raise HTTPException(
            status_code=409,
            detail="User with this email already exists",
        ) from e
    except IntegrityError as e:
        await uow_ctl.rollback()
        raise HTTPException(
            status_code=409,
            detail="Username already exists",
        ) from e

    if payload.email:
        try:
            request_ip = request.client.host if request.client else "unknown"
            user_agent = request.headers.get("user-agent", "unknown")
            await email_service.send_verification_code(
                user,
                request_ip=request_ip,
                user_agent=user_agent,
            )
        except EmailAlreadyVerified:
            pass

    await uow_ctl.commit()

    return RegisterResponse(
        message="User registered successfully",
        email_verification_required=payload.email is not None,
    )


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
