from __future__ import annotations

from dishka import FromDishka
from dishka.integrations.fastapi import inject
from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel

from hack_backend.core.services.access import AccessService
from hack_backend.core.services.platform_service import PlatformService
from hack_backend.core.services.uow_ctl import UoWCtl
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
    approved_command: str | None = None
    target_endpoint: str | None = None


class PatchScheduleRulePayload(BaseModel):
    is_enabled: bool | None = None
    cron_expr: str | None = None


@router.get(
    "/environments/{environment_id}/schedule-rules",
    response_model=list[ScheduleRuleDTO],
)
@inject
async def list_schedule_rules(
    environment_id: str,
    current_user: FromDishka[AuthorizedUser],
    access_service: FromDishka[AccessService],
    platform_service: FromDishka[PlatformService],
) -> list[ScheduleRuleDTO]:
    await access_service.require_environment_member(
        environment_id,
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
    access_service: FromDishka[AccessService],
    platform_service: FromDishka[PlatformService],
    uow_ctl: FromDishka[UoWCtl],
) -> ScheduleRuleDTO:
    await access_service.require_environment_member(
        payload.environment_id,
        user_id=current_user.id,
    )
    rule = await platform_service.create_schedule_rule(
        environment_id=payload.environment_id,
        task_template_id=payload.task_template_id,
        cron_expr=payload.cron_expr,
        target_selector_json={
            **({"host_ids": payload.host_ids} if payload.host_ids else {}),
            **({"approved_command": payload.approved_command} if payload.approved_command else {}),
            **({"target_endpoint": payload.target_endpoint} if payload.target_endpoint else {}),
        },
        is_enabled=payload.is_enabled,
    )
    await uow_ctl.commit()
    return schedule_rule_to_dto(rule, rule.task_template)


@router.patch("/schedule-rules/{schedule_rule_id}", response_model=ScheduleRuleDTO)
@inject
async def patch_schedule_rule(
    schedule_rule_id: str,
    payload: PatchScheduleRulePayload,
    current_user: FromDishka[AuthorizedUser],
    platform_service: FromDishka[PlatformService],
    uow_ctl: FromDishka[UoWCtl],
) -> ScheduleRuleDTO:
    rule = await platform_service.get_schedule_rule(schedule_rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail="Schedule rule not found")
    await require_environment_member(
        rule.environment_id,
        session=platform_service.session,
        user_id=current_user.id,
    )
    rule = await platform_service.patch_schedule_rule(
        schedule_rule_id,
        is_enabled=payload.is_enabled,
        cron_expr=payload.cron_expr,
    )
    await uow_ctl.commit()
    return schedule_rule_to_dto(rule, rule.task_template)


@router.delete("/schedule-rules/{schedule_rule_id}", status_code=204)
@inject
async def delete_schedule_rule(
    schedule_rule_id: str,
    current_user: FromDishka[AuthorizedUser],
    platform_service: FromDishka[PlatformService],
    uow_ctl: FromDishka[UoWCtl],
) -> Response:
    rule = await platform_service.get_schedule_rule(schedule_rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail="Schedule rule not found")
    await require_environment_member(
        rule.environment_id,
        session=platform_service.session,
        user_id=current_user.id,
    )
    await platform_service.delete_schedule_rule(schedule_rule_id)
    await uow_ctl.commit()
    return Response(status_code=204)
