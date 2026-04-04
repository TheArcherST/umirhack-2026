from __future__ import annotations

from dishka import FromDishka
from dishka.integrations.fastapi import inject
from fastapi import APIRouter

from hack_backend.core.models import User
from hack_backend.core.services.platform_service import PlatformService
from hack_backend.core.services.uow_ctl import UoWCtl
from hack_backend.rest_server.dependencies import require_project_member
from hack_backend.rest_server.providers import AuthorizedUser
from hack_backend.rest_server.schemas.platform import TaskTemplateDTO
from hack_backend.rest_server.serializers import task_template_to_dto

router = APIRouter(tags=["task-templates"])


@router.get("/task-templates", response_model=list[TaskTemplateDTO])
@inject
async def list_task_templates(
    project_id: str,
    current_user: FromDishka[AuthorizedUser],
    platform_service: FromDishka[PlatformService],
    uow_ctl: FromDishka[UoWCtl],
) -> list[TaskTemplateDTO]:
    await require_project_member(
        project_id,
        session=platform_service.session,
        user_id=current_user.id,
    )
    templates = await platform_service.list_task_templates(project_id)
    await uow_ctl.commit()
    return [task_template_to_dto(template) for template in templates]
