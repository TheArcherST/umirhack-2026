from __future__ import annotations

from dishka import FromDishka
from dishka.integrations.fastapi import inject
from fastapi import APIRouter
from pydantic import BaseModel

from hack_backend.core.services.platform_service import PlatformService
from hack_backend.core.services.uow_ctl import UoWCtl
from hack_backend.rest_server.dependencies import require_environment_member
from hack_backend.rest_server.providers import AuthorizedUser
from hack_backend.rest_server.schemas.platform import ScheduleRuleDTO
from hack_backend.rest_server.serializers import schedule_rule_to_dto

router = APIRouter(tags=["schedule-rules"])


class CreateScheduleRulePayload(BaseModel):
    environment_id: str
    task_template_id: str
    cron_expr: str
    host_ids: list[str] | None = None
    is_enabled: bool = True


@router.get(
    "/environments/{environment_id}/schedule-rules",
    response_model=list[ScheduleRuleDTO],
)
@inject
async def list_schedule_rules(
    environment_id: str,
    current_user: FromDishka[AuthorizedUser],
    platform_service: FromDishka[PlatformService],
) -> list[ScheduleRuleDTO]:
    await require_environment_member(
        environment_id,
        session=platform_service.session,
        user_id=current_user.id,
    )
    rules = await platform_service.list_schedule_rules(environment_id)
    return [
        schedule_rule_to_dto(rule, rule.task_template)
        for rule in rules
    ]


@router.post("/schedule-rules", status_code=201, response_model=ScheduleRuleDTO)
@inject
async def create_schedule_rule(
    payload: CreateScheduleRulePayload,
    current_user: FromDishka[AuthorizedUser],
    platform_service: FromDishka[PlatformService],
    uow_ctl: FromDishka[UoWCtl],
) -> ScheduleRuleDTO:
    await require_environment_member(
        payload.environment_id,
        session=platform_service.session,
        user_id=current_user.id,
    )
    rule = await platform_service.create_schedule_rule(
        environment_id=payload.environment_id,
        task_template_id=payload.task_template_id,
        cron_expr=payload.cron_expr,
        target_selector_json=(
            {"host_ids": payload.host_ids} if payload.host_ids else {}
        ),
        is_enabled=payload.is_enabled,
    )
    await uow_ctl.commit()
    return schedule_rule_to_dto(rule, rule.task_template)
