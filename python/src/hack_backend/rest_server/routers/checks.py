from uuid import UUID

from dishka import FromDishka
from dishka.integrations.fastapi import inject
from fastapi import APIRouter, HTTPException, status

from hack_backend.core.models.check import Check
from hack_backend.core.services.checks import CheckService
from hack_backend.core.services.uow_ctl import UoWCtl
from hack_backend.rest_server.schemas.checks import (
    CheckDTO,
    CreateCheckDTO,
)

router = APIRouter(
    prefix="/checks",
)


@router.post(
    "",
    response_model=CheckDTO,
    status_code=status.HTTP_201_CREATED,
)
@inject
async def create_check(
    check_service: FromDishka[CheckService],
    uow_ctl: FromDishka[UoWCtl],
    payload: CreateCheckDTO,
) -> Check:
    check = await check_service.create_check(
        payload=payload.payload,
    )
    await uow_ctl.commit()
    return check


@router.get(
    "/{check_uid}",
    response_model=CheckDTO,
)
@inject
async def get_check(
    streams_service: FromDishka[CheckService],
    check_uid: UUID,
) -> Check:
    check = await streams_service.get_check(
        check_uid=check_uid,
    )
    if check is None:
        raise HTTPException(
            status_code=404,
            detail="Check not found",
        )
    return check
