from __future__ import annotations

from typing import Any

from dishka import FromDishka
from dishka.integrations.fastapi import inject
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from hack_backend.core.services.access import AccessService
from hack_backend.core.services.compliance_service import ComplianceService
from hack_backend.core.services.uow_ctl import UoWCtl
from hack_backend.rest_server.compliance_notifications import (
    dispatch_pending_compliance_email_notifications,
)
from hack_backend.rest_server.providers import AuthorizedUser
from hack_backend.rest_server.schemas.platform import (
    ComplianceCatalogItemDTO,
    ComplianceEventDTO,
    ComplianceFindingDTO,
    CompliancePolicyDTO,
)
from hack_backend.rest_server.serializers import (
    compliance_catalog_item_to_dto,
    compliance_event_to_dto,
    compliance_finding_to_dto,
    compliance_policy_with_revision_to_dto,
)

router = APIRouter(tags=["compliance"])


class CreateCompliancePolicyPayload(BaseModel):
    environment_id: str
    name: str
    entity_kind: str
    mode: str
    description: str | None = None
    is_enabled: bool = True
    definition_json: dict[str, Any] = Field(default_factory=dict)


class PatchCompliancePolicyPayload(BaseModel):
    name: str | None = None
    entity_kind: str | None = None
    mode: str | None = None
    description: str | None = None
    is_enabled: bool | None = None
    definition_json: dict[str, Any] | None = None


@router.get("/compliance/catalog", response_model=list[ComplianceCatalogItemDTO])
@inject
async def get_compliance_catalog(
    compliance_service: FromDishka[ComplianceService],
) -> list[ComplianceCatalogItemDTO]:
    return [
        compliance_catalog_item_to_dto(item)
        for item in compliance_service.catalog()
    ]


@router.get(
    "/environments/{environment_id}/compliance/policies",
    response_model=list[CompliancePolicyDTO],
)
@inject
async def list_compliance_policies(
    environment_id: str,
    current_user: FromDishka[AuthorizedUser],
    access_service: FromDishka[AccessService],
    compliance_service: FromDishka[ComplianceService],
) -> list[CompliancePolicyDTO]:
    await access_service.require_environment_member(
        environment_id,
        user_id=current_user.id,
    )
    policies = await compliance_service.list_policies(environment_id)
    revisions = {
        policy.id: await compliance_service.get_policy_revision(
            policy.current_revision_id
        )
        for policy in policies
    }
    return [
        compliance_policy_with_revision_to_dto(policy, revisions[policy.id])
        for policy in policies
    ]


@router.post(
    "/compliance/policies",
    status_code=201,
    response_model=CompliancePolicyDTO,
)
@inject
async def create_compliance_policy(
    payload: CreateCompliancePolicyPayload,
    current_user: FromDishka[AuthorizedUser],
    access_service: FromDishka[AccessService],
    compliance_service: FromDishka[ComplianceService],
    uow_ctl: FromDishka[UoWCtl],
) -> CompliancePolicyDTO:
    await access_service.require_environment_operator(
        payload.environment_id,
        user_id=current_user.id,
    )
    policy = await compliance_service.create_policy(
        environment_id=payload.environment_id,
        name=payload.name,
        entity_kind=payload.entity_kind,
        mode=payload.mode,
        description=payload.description,
        is_enabled=payload.is_enabled,
        definition_json=payload.definition_json,
        actor_user_id=current_user.id,
    )
    await uow_ctl.commit()
    await dispatch_pending_compliance_email_notifications(compliance_service.session)
    return compliance_policy_with_revision_to_dto(
        policy,
        await compliance_service.get_policy_revision(policy.current_revision_id),
    )


@router.patch(
    "/compliance/policies/{policy_id}",
    response_model=CompliancePolicyDTO,
)
@inject
async def patch_compliance_policy(
    policy_id: str,
    payload: PatchCompliancePolicyPayload,
    current_user: FromDishka[AuthorizedUser],
    access_service: FromDishka[AccessService],
    compliance_service: FromDishka[ComplianceService],
    uow_ctl: FromDishka[UoWCtl],
) -> CompliancePolicyDTO:
    policy = await compliance_service.get_policy(policy_id)
    if policy is None:
        raise HTTPException(status_code=404, detail="Compliance policy not found")
    await access_service.require_environment_operator(
        policy.environment_id,
        user_id=current_user.id,
    )
    updated = await compliance_service.patch_policy(
        policy_id=policy_id,
        name=payload.name,
        entity_kind=payload.entity_kind,
        mode=payload.mode,
        description=payload.description,
        is_enabled=payload.is_enabled,
        definition_json=payload.definition_json,
        actor_user_id=current_user.id,
    )
    await uow_ctl.commit()
    await dispatch_pending_compliance_email_notifications(compliance_service.session)
    return compliance_policy_with_revision_to_dto(
        updated,
        await compliance_service.get_policy_revision(updated.current_revision_id),
    )


@router.delete("/compliance/policies/{policy_id}", status_code=204)
@inject
async def delete_compliance_policy(
    policy_id: str,
    current_user: FromDishka[AuthorizedUser],
    access_service: FromDishka[AccessService],
    compliance_service: FromDishka[ComplianceService],
    uow_ctl: FromDishka[UoWCtl],
) -> None:
    policy = await compliance_service.get_policy(policy_id)
    if policy is None:
        return
    await access_service.require_environment_operator(
        policy.environment_id,
        user_id=current_user.id,
    )
    await compliance_service.delete_policy(policy_id)
    await uow_ctl.commit()
    await dispatch_pending_compliance_email_notifications(compliance_service.session)


@router.get(
    "/environments/{environment_id}/compliance/findings",
    response_model=list[ComplianceFindingDTO],
)
@inject
async def list_compliance_findings(
    environment_id: str,
    current_user: FromDishka[AuthorizedUser],
    access_service: FromDishka[AccessService],
    compliance_service: FromDishka[ComplianceService],
    uow_ctl: FromDishka[UoWCtl],
) -> list[ComplianceFindingDTO]:
    await access_service.require_environment_member(
        environment_id,
        user_id=current_user.id,
    )
    if await compliance_service.materialize_expired_findings(
        environment_id=environment_id
    ):
        await uow_ctl.commit()
        await dispatch_pending_compliance_email_notifications(compliance_service.session)
    return [
        compliance_finding_to_dto(finding)
        for finding in await compliance_service.list_active_findings(
            environment_id=environment_id
        )
    ]


@router.get(
    "/environments/{environment_id}/compliance/events",
    response_model=list[ComplianceEventDTO],
)
@inject
async def list_compliance_events(
    environment_id: str,
    current_user: FromDishka[AuthorizedUser],
    access_service: FromDishka[AccessService],
    compliance_service: FromDishka[ComplianceService],
    uow_ctl: FromDishka[UoWCtl],
) -> list[ComplianceEventDTO]:
    await access_service.require_environment_member(
        environment_id,
        user_id=current_user.id,
    )
    if await compliance_service.materialize_expired_findings(
        environment_id=environment_id
    ):
        await uow_ctl.commit()
        await dispatch_pending_compliance_email_notifications(compliance_service.session)
    return [
        compliance_event_to_dto(event)
        for event in await compliance_service.list_events(
            environment_id=environment_id
        )
    ]
