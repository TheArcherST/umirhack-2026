from dishka import FromDishka
from dishka.integrations.fastapi import inject
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from hack_backend.core.models import User
from hack_backend.core.services.email_verification import (
    CodeExpired,
    EmailAlreadyVerified,
    EmailVerificationError,
    EmailVerificationService,
    InvalidVerificationCode,
    NoOtpSecret,
)
from hack_backend.core.services.uow_ctl import UoWCtl

router = APIRouter(
    prefix="",
    tags=["email-verification"],
)


class VerifyEmailPayload(BaseModel):
    username: str
    code: str


class VerifyEmailResponse(BaseModel):
    message: str


class ResendCodePayload(BaseModel):
    username: str


class ResendCodeResponse(BaseModel):
    message: str


@router.post(
    "/auth/email/verify",
    status_code=200,
)
@inject
async def verify_email(
    payload: VerifyEmailPayload,
    orm_session: FromDishka[AsyncSession],
    email_service: FromDishka[EmailVerificationService],
    uow_ctl: FromDishka[UoWCtl],
) -> VerifyEmailResponse:
    stmt = select(User).where(User.username == payload.username)
    user = await orm_session.scalar(stmt)

    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        email_service.verify_code(user, payload.code)
    except EmailAlreadyVerified as e:
        raise HTTPException(
            status_code=400, detail="Email already verified"
        ) from e
    except NoOtpSecret as e:
        raise HTTPException(
            status_code=400, detail="No OTP secret configured"
        ) from e
    except CodeExpired as e:
        raise HTTPException(
            status_code=400, detail="Code expired. Request a new one."
        ) from e
    except InvalidVerificationCode as e:
        raise HTTPException(
            status_code=400, detail="Invalid code"
        ) from e

    await uow_ctl.commit()
    return VerifyEmailResponse(message="Email verified successfully")


@router.post(
    "/auth/email/resend",
    status_code=200,
)
@inject
async def resend_code(
    request: Request,
    payload: ResendCodePayload,
    orm_session: FromDishka[AsyncSession],
    email_service: FromDishka[EmailVerificationService],
    uow_ctl: FromDishka[UoWCtl],
) -> ResendCodeResponse:
    """Resend a new verification code to the user's email."""
    stmt = select(User).where(User.username == payload.username)
    user = await orm_session.scalar(stmt)

    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        request_ip = request.client.host if request.client else "unknown"
        user_agent = request.headers.get("user-agent", "unknown")
        await email_service.send_verification_code(
            user,
            request_ip=request_ip,
            user_agent=user_agent,
        )
    except EmailAlreadyVerified as e:
        raise HTTPException(
            status_code=400, detail="Email already verified"
        ) from e
    except EmailVerificationError as e:
        raise HTTPException(
            status_code=400, detail=str(e)
        ) from e

    await uow_ctl.commit()
    return ResendCodeResponse(message="Verification code sent")
