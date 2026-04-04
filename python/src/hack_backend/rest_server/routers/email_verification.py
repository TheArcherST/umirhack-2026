from __future__ import annotations

from dishka import FromDishka
from dishka.integrations.fastapi import inject
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from hack_backend.core.models import User
from hack_backend.core.services.access import AccessService
from hack_backend.core.services.email_verification import (
    EmailAlreadyVerified,
    EmailVerificationError,
    EmailVerificationService,
    InvalidVerificationCode,
    NoOtpSecret,
)
from hack_backend.core.services.uow_ctl import UoWCtl
from hack_backend.rest_server.routers.access import (
    AuthorizationCredentials,
    auth_response_for_user_token,
)

router = APIRouter(tags=["email-verification"])


class VerifyEmailPayload(BaseModel):
    username: str
    code: str


class VerifyEmailResponse(BaseModel):
    message: str
    auth: AuthorizationCredentials


class ResendCodePayload(BaseModel):
    username: str


class ResendCodeResponse(BaseModel):
    message: str


@router.post("/auth/email/verify", response_model=VerifyEmailResponse)
@inject
async def verify_email(
    payload: VerifyEmailPayload,
    email_verification_service: FromDishka[EmailVerificationService],
    access_service: FromDishka[AccessService],
    uow_ctl: FromDishka[UoWCtl],
    user_agent: str | None = Header(default=None, alias="User-Agent"),
) -> VerifyEmailResponse:
    session = email_verification_service.orm_session
    user = await session.scalar(
        select(User).where(User.username == payload.username.strip())
    )
    if user is None:
        raise HTTPException(status_code=400, detail="Invalid code")
    try:
        email_verification_service.verify_code(user, payload.code)
        login_session = await access_service.create_login_session(
            user=user,
            user_agent=user_agent,
        )
    except (InvalidVerificationCode, NoOtpSecret) as exc:
        await uow_ctl.rollback()
        raise HTTPException(status_code=400, detail="Invalid code") from exc
    except EmailAlreadyVerified as exc:
        await uow_ctl.rollback()
        raise HTTPException(status_code=400, detail="Email already verified") from exc

    await uow_ctl.commit()
    return VerifyEmailResponse(
        message="Email verified successfully",
        auth=auth_response_for_user_token(
            user_id=user.id,
            username=user.username,
            email=user.email,
            token=login_session.token,
        ),
    )


@router.post("/auth/email/resend", response_model=ResendCodeResponse)
@inject
async def resend_code(
    payload: ResendCodePayload,
    email_verification_service: FromDishka[EmailVerificationService],
    uow_ctl: FromDishka[UoWCtl],
    user_agent: str | None = Header(default=None, alias="User-Agent"),
    request_ip: str | None = Header(default=None, alias="X-Forwarded-For"),
) -> ResendCodeResponse:
    session = email_verification_service.orm_session
    user = await session.scalar(
        select(User).where(User.username == payload.username.strip())
    )
    if user is not None:
        try:
            await email_verification_service.send_verification_code(
                user,
                request_ip=(request_ip or "unknown").split(",")[0].strip() or "unknown",
                user_agent=user_agent or "unknown",
            )
        except EmailVerificationError:
            pass
    await uow_ctl.commit()
    return ResendCodeResponse(
        message="If the account exists, a verification code has been sent",
    )
