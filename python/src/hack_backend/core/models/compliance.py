from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, CreatedAt
from .enums import ComplianceEventKind, ComplianceEventOrigin, ComplianceMode
from .ids import new_id


class CompliancePolicy(Base):
    __tablename__ = "compliance_policy"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    environment_id: Mapped[str] = mapped_column(
        ForeignKey("environment.id"),
        index=True,
    )
    name: Mapped[str]
    entity_kind: Mapped[str]
    mode: Mapped[ComplianceMode]
    description: Mapped[str | None] = mapped_column(nullable=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean(), default=True)
    current_revision_id: Mapped[str | None] = mapped_column(
        ForeignKey("compliance_policy_revision.id"),
        nullable=True,
        index=True,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[CreatedAt]


class CompliancePolicyRevision(Base):
    __tablename__ = "compliance_policy_revision"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    policy_id: Mapped[str] = mapped_column(
        ForeignKey("compliance_policy.id"),
        index=True,
    )
    revision_no: Mapped[int] = mapped_column(Integer(), nullable=False)
    definition_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    compiled_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("user.id"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[CreatedAt]


class ComplianceEvaluation(Base):
    __tablename__ = "compliance_evaluation"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    policy_id: Mapped[str] = mapped_column(
        ForeignKey("compliance_policy.id"),
        index=True,
    )
    revision_id: Mapped[str] = mapped_column(
        ForeignKey("compliance_policy_revision.id"),
        index=True,
    )
    environment_id: Mapped[str] = mapped_column(
        ForeignKey("environment.id"),
        index=True,
    )
    host_id: Mapped[str | None] = mapped_column(
        ForeignKey("host.id"),
        nullable=True,
        index=True,
    )
    entity_kind: Mapped[str]
    subject_key: Mapped[str] = mapped_column(index=True)
    subject_label: Mapped[str]
    scope_key: Mapped[str | None] = mapped_column(nullable=True, index=True)
    source_kind: Mapped[str]
    source_record_id: Mapped[str]
    observed_at: Mapped[datetime]
    is_violation: Mapped[bool] = mapped_column(Boolean(), default=False)
    event_origin: Mapped[ComplianceEventOrigin]
    matched_rule_ids_json: Mapped[list[str]] = mapped_column(JSON, default=list)
    evidence_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    expires_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[CreatedAt]


class ComplianceCurrentFinding(Base):
    __tablename__ = "compliance_current_finding"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    policy_id: Mapped[str] = mapped_column(
        ForeignKey("compliance_policy.id"),
        index=True,
    )
    revision_id: Mapped[str] = mapped_column(
        ForeignKey("compliance_policy_revision.id"),
        index=True,
    )
    environment_id: Mapped[str] = mapped_column(
        ForeignKey("environment.id"),
        index=True,
    )
    latest_evaluation_id: Mapped[str] = mapped_column(
        ForeignKey("compliance_evaluation.id"),
        index=True,
    )
    host_id: Mapped[str | None] = mapped_column(
        ForeignKey("host.id"),
        nullable=True,
        index=True,
    )
    entity_kind: Mapped[str]
    subject_key: Mapped[str] = mapped_column(index=True)
    subject_label: Mapped[str]
    scope_key: Mapped[str | None] = mapped_column(nullable=True, index=True)
    matched_rule_ids_json: Mapped[list[str]] = mapped_column(JSON, default=list)
    evidence_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    observed_at: Mapped[datetime]
    expires_at: Mapped[datetime | None] = mapped_column(nullable=True)
    is_violation: Mapped[bool] = mapped_column(Boolean(), default=False)
    created_at: Mapped[CreatedAt]


class ComplianceEvent(Base):
    __tablename__ = "compliance_event"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    policy_id: Mapped[str] = mapped_column(
        ForeignKey("compliance_policy.id"),
        index=True,
    )
    revision_id: Mapped[str] = mapped_column(
        ForeignKey("compliance_policy_revision.id"),
        index=True,
    )
    evaluation_id: Mapped[str | None] = mapped_column(
        ForeignKey("compliance_evaluation.id"),
        nullable=True,
        index=True,
    )
    environment_id: Mapped[str] = mapped_column(
        ForeignKey("environment.id"),
        index=True,
    )
    host_id: Mapped[str | None] = mapped_column(
        ForeignKey("host.id"),
        nullable=True,
        index=True,
    )
    entity_kind: Mapped[str]
    subject_key: Mapped[str] = mapped_column(index=True)
    subject_label: Mapped[str]
    event_kind: Mapped[ComplianceEventKind]
    event_origin: Mapped[ComplianceEventOrigin]
    happened_at: Mapped[datetime]
    payload_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[CreatedAt]
