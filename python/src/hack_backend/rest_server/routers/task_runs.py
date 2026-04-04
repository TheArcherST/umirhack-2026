from __future__ import annotations

from dishka import FromDishka
from dishka.integrations.fastapi import inject
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from hack_backend.core.models import TaskRun, TaskRunResult
from hack_backend.core.services.access import AccessService
from hack_backend.core.services.platform_service import PlatformService
from hack_backend.core.services.uow_ctl import UoWCtl
from hack_backend.rest_server.providers import AuthorizedUser
from hack_backend.rest_server.schemas.platform import TaskRunDTO, TaskRunResultDTO
from hack_backend.rest_server.serializers import (
    task_run_result_to_dto,
    task_run_to_dto,
)

router = APIRouter(tags=["task-runs"])


class CreateTaskRunsPayload(BaseModel):
    environment_id: str
    host_ids: list[str]
    task_template_id: str
    payload_overrides: dict | None = None


@router.post("/task-runs", status_code=201, response_model=list[TaskRunDTO])
@inject
async def create_task_runs(
    payload: CreateTaskRunsPayload,
    current_user: FromDishka[AuthorizedUser],
    access_service: FromDishka[AccessService],
    platform_service: FromDishka[PlatformService],
    uow_ctl: FromDishka[UoWCtl],
) -> list[TaskRunDTO]:
    await access_service.require_environment_member(
        payload.environment_id,
        user_id=current_user.id,
    )
    task_runs = await platform_service.create_task_runs(
        environment_id=payload.environment_id,
        host_ids=payload.host_ids,
        task_template_id=payload.task_template_id,
        payload_overrides=payload.payload_overrides,
    )
    await uow_ctl.commit()
    return [task_run_to_dto(task_run) for task_run in task_runs]


@router.get("/task-runs/{task_run_id}", response_model=TaskRunDTO)
@inject
async def get_task_run(
    task_run_id: str,
    current_user: FromDishka[AuthorizedUser],
    access_service: FromDishka[AccessService],
    platform_service: FromDishka[PlatformService],
) -> TaskRunDTO:
    task_run = await platform_service.session.get(TaskRun, task_run_id)
    if task_run is None:
        raise HTTPException(status_code=404, detail="Task run not found")
    await access_service.require_environment_member(
        task_run.environment_id,
        user_id=current_user.id,
    )
    return task_run_to_dto(task_run)


@router.get("/task-runs/{task_run_id}/result", response_model=TaskRunResultDTO)
@inject
async def get_task_run_result(
    task_run_id: str,
    current_user: FromDishka[AuthorizedUser],
    access_service: FromDishka[AccessService],
    platform_service: FromDishka[PlatformService],
) -> TaskRunResultDTO:
    task_run = await platform_service.session.get(TaskRun, task_run_id)
    if task_run is None:
        raise HTTPException(status_code=404, detail="Task run not found")
    await access_service.require_environment_member(
        task_run.environment_id,
        user_id=current_user.id,
    )
    result = await platform_service.session.get(TaskRunResult, task_run_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Task result not found")
    return task_run_result_to_dto(result)
