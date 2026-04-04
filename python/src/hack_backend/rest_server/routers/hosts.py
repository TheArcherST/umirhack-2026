from __future__ import annotations

from dishka import FromDishka
from dishka.integrations.fastapi import inject
from fastapi import APIRouter, HTTPException

from hack_backend.core.models import Host
from hack_backend.core.services.access import AccessService
from hack_backend.core.services.platform_service import PlatformService
from hack_backend.core.services.uow_ctl import UoWCtl
from hack_backend.rest_server.providers import AuthorizedUser
from hack_backend.rest_server.schemas.platform import (
    HostDetailDTO,
    MetricSnapshotDTO,
    TelemetryRecordDTO,
)
from hack_backend.rest_server.serializers import (
    host_detail_to_dto,
    metric_to_dto,
    telemetry_to_dto,
)

router = APIRouter(tags=["hosts"])


@router.get("/hosts/{host_id}", response_model=HostDetailDTO)
@inject
async def get_host(
    host_id: str,
    current_user: FromDishka[AuthorizedUser],
    access_service: FromDishka[AccessService],
    platform_service: FromDishka[PlatformService],
) -> HostDetailDTO:
    host = await platform_service.session.get(Host, host_id)
    if host is None:
        raise HTTPException(status_code=404, detail="Host not found")
    await access_service.require_environment_member(
        host.environment_id,
        user_id=current_user.id,
    )
    return host_detail_to_dto(host)


@router.delete("/hosts/{host_id}", status_code=204)
@inject
async def delete_host(
    host_id: str,
    current_user: FromDishka[AuthorizedUser],
    access_service: FromDishka[AccessService],
    platform_service: FromDishka[PlatformService],
    uow_ctl: FromDishka[UoWCtl],
) -> None:
    host = await platform_service.session.get(Host, host_id)
    if host is None:
        return
    await access_service.require_environment_member(
        host.environment_id,
        user_id=current_user.id,
    )
    await platform_service.delete_host(host_id)
    await uow_ctl.commit()


@router.get("/hosts/{host_id}/telemetry", response_model=list[TelemetryRecordDTO])
@inject
async def list_host_telemetry(
    host_id: str,
    current_user: FromDishka[AuthorizedUser],
    access_service: FromDishka[AccessService],
    platform_service: FromDishka[PlatformService],
) -> list[TelemetryRecordDTO]:
    host = await platform_service.session.get(Host, host_id)
    if host is None:
        raise HTTPException(status_code=404, detail="Host not found")
    await access_service.require_environment_member(
        host.environment_id,
        user_id=current_user.id,
    )
    records = await platform_service.list_host_telemetry(host_id)
    return [telemetry_to_dto(record) for record in records]


@router.get("/hosts/{host_id}/metrics", response_model=list[MetricSnapshotDTO])
@inject
async def list_host_metrics(
    host_id: str,
    current_user: FromDishka[AuthorizedUser],
    access_service: FromDishka[AccessService],
    platform_service: FromDishka[PlatformService],
) -> list[MetricSnapshotDTO]:
    host = await platform_service.session.get(Host, host_id)
    if host is None:
        raise HTTPException(status_code=404, detail="Host not found")
    await access_service.require_environment_member(
        host.environment_id,
        user_id=current_user.id,
    )
    metrics = await platform_service.list_host_metrics(host_id)
    return [metric_to_dto(metric) for metric in metrics]
