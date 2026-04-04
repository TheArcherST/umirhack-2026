from dishka import FromDishka
from dishka.integrations.fastapi import inject
from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError

from hack_backend.core.providers import ConfigEmail, ConfigServer
from hack_backend.core.services.access import (
    AccessService,
    ErrorPasswordChangeTokenExpired,
    ErrorPasswordChangeTokenInvalid,
    ErrorUnauthorized,
    ErrorUsernameAlreadyExists,
)
from hack_backend.core.services.uow_ctl import UoWCtl
from hack_backend.rest_server.providers import AuthorizedUser
from hack_backend.rest_server.routers.access import AuthUserDTO
from hack_backend.tasksd.email_tasks import send_password_change_email_task

router = APIRouter(tags=["user-settings"])


class UpdateMePayload(BaseModel):
    name: str


class InitiatePasswordChangePayload(BaseModel):
    current_password: str
    new_password: str


class MessageResponse(BaseModel):
    message: str


@router.patch("/me", response_model=AuthUserDTO)
@inject
async def update_me(
    payload: UpdateMePayload,
    current_user: FromDishka[AuthorizedUser],
    access_service: FromDishka[AccessService],
    uow_ctl: FromDishka[UoWCtl],
) -> AuthUserDTO:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Name cannot be empty")
    try:
        await access_service.update_username(current_user, name)
    except ErrorUsernameAlreadyExists as exc:
        await uow_ctl.rollback()
        raise HTTPException(status_code=409, detail="Username already taken") from exc
    except IntegrityError as exc:
        await uow_ctl.rollback()
        raise HTTPException(status_code=409, detail="Username already taken") from exc
    await uow_ctl.commit()
    return AuthUserDTO(
        id=str(current_user.id),
        email=current_user.email or current_user.username,
        name=current_user.username,
    )


@router.post("/me/password", response_model=MessageResponse)
@inject
async def initiate_password_change(
    payload: InitiatePasswordChangePayload,
    current_user: FromDishka[AuthorizedUser],
    access_service: FromDishka[AccessService],
    email_config: FromDishka[ConfigEmail],
    server_config: FromDishka[ConfigServer],
    uow_ctl: FromDishka[UoWCtl],
    request_ip: str | None = Header(default=None, alias="X-Forwarded-For"),
) -> MessageResponse:
    if len(payload.new_password) < 6:
        raise HTTPException(status_code=422, detail="New password must be at least 6 characters")
    try:
        token = await access_service.initiate_password_change(
            user=current_user,
            current_password=payload.current_password,
            new_password=payload.new_password,
            validity_hours=email_config.password_change_validity_hours,
        )
    except ErrorUnauthorized as exc:
        await uow_ctl.rollback()
        raise HTTPException(status_code=401, detail="Current password is incorrect") from exc

    base_url = server_config.frontend_url.rstrip("/")
    confirm_url = f"{base_url}/api/me/password/confirm?token={token}"
    cancel_url = f"{base_url}/api/me/password/cancel?token={token}"

    if current_user.email:
        await send_password_change_email_task.kiq(
            email_address=current_user.email,
            user_name=current_user.username,
            confirm_url=confirm_url,
            cancel_url=cancel_url,
            request_ip=(request_ip or "unknown").split(",")[0].strip() or "unknown",
        )

    await uow_ctl.commit()
    return MessageResponse(message="Confirmation email sent")


@router.get(
    "/me/password/confirm",
    response_class=RedirectResponse,
    response_model=None,
)
@inject
async def confirm_password_change(
    token: str,
    access_service: FromDishka[AccessService],
    server_config: FromDishka[ConfigServer],
    uow_ctl: FromDishka[UoWCtl],
) -> RedirectResponse:
    try:
        await access_service.confirm_password_change(token)
    except ErrorPasswordChangeTokenInvalid as exc:
        await uow_ctl.rollback()
        raise HTTPException(status_code=400, detail="Invalid or already used token") from exc
    except ErrorPasswordChangeTokenExpired as exc:
        await uow_ctl.rollback()
        raise HTTPException(status_code=400, detail="Token has expired") from exc
    await uow_ctl.commit()
    redirect_to = server_config.frontend_url.rstrip("/") or "/"
    return RedirectResponse(url=f"{redirect_to}?password_changed=1", status_code=302)


@router.get(
    "/me/password/cancel",
    response_class=RedirectResponse,
    response_model=None,
)
@inject
async def cancel_password_change(
    token: str,
    access_service: FromDishka[AccessService],
    server_config: FromDishka[ConfigServer],
    uow_ctl: FromDishka[UoWCtl],
) -> RedirectResponse:
    try:
        await access_service.cancel_password_change(token)
    except (ErrorPasswordChangeTokenInvalid, ErrorPasswordChangeTokenExpired):
        pass
    await uow_ctl.commit()
    redirect_to = server_config.frontend_url.rstrip("/") or "/"
    return RedirectResponse(url=f"{redirect_to}?password_change_cancelled=1", status_code=302)
