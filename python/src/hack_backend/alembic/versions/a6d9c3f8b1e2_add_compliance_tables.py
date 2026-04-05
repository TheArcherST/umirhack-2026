"""add compliance tables

Revision ID: a6d9c3f8b1e2
Revises: c4a8d7e2f1b0
Create Date: 2026-04-05 12:30:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "a6d9c3f8b1e2"
down_revision = "c4a8d7e2f1b0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "compliance_policy",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("environment_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("entity_kind", sa.String(), nullable=False),
        sa.Column("mode", sa.String(length=16), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("definition_json", sa.JSON(), nullable=False),
        sa.Column("compiled_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["environment_id"], ["environment.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_compliance_policy_environment_id",
        "compliance_policy",
        ["environment_id"],
        unique=False,
    )

    op.create_table(
        "compliance_evaluation",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("policy_id", sa.String(length=36), nullable=False),
        sa.Column("environment_id", sa.String(length=36), nullable=False),
        sa.Column("host_id", sa.String(length=36), nullable=True),
        sa.Column("entity_kind", sa.String(), nullable=False),
        sa.Column("subject_key", sa.String(), nullable=False),
        sa.Column("subject_label", sa.String(), nullable=False),
        sa.Column("scope_key", sa.String(), nullable=True),
        sa.Column("source_kind", sa.String(), nullable=False),
        sa.Column("source_record_id", sa.String(length=36), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_violation", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("matched_rule_ids_json", sa.JSON(), nullable=False),
        sa.Column("evidence_json", sa.JSON(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["environment_id"], ["environment.id"]),
        sa.ForeignKeyConstraint(["host_id"], ["host.id"]),
        sa.ForeignKeyConstraint(["policy_id"], ["compliance_policy.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_compliance_evaluation_policy_id",
        "compliance_evaluation",
        ["policy_id"],
        unique=False,
    )
    op.create_index(
        "ix_compliance_evaluation_environment_id",
        "compliance_evaluation",
        ["environment_id"],
        unique=False,
    )
    op.create_index(
        "ix_compliance_evaluation_host_id",
        "compliance_evaluation",
        ["host_id"],
        unique=False,
    )
    op.create_index(
        "ix_compliance_evaluation_subject_key",
        "compliance_evaluation",
        ["subject_key"],
        unique=False,
    )
    op.create_index(
        "ix_compliance_evaluation_scope_key",
        "compliance_evaluation",
        ["scope_key"],
        unique=False,
    )

    op.create_table(
        "compliance_event",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("policy_id", sa.String(length=36), nullable=False),
        sa.Column("evaluation_id", sa.String(length=36), nullable=True),
        sa.Column("environment_id", sa.String(length=36), nullable=False),
        sa.Column("host_id", sa.String(length=36), nullable=True),
        sa.Column("entity_kind", sa.String(), nullable=False),
        sa.Column("subject_key", sa.String(), nullable=False),
        sa.Column("subject_label", sa.String(), nullable=False),
        sa.Column("event_kind", sa.String(length=16), nullable=False),
        sa.Column("happened_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["environment_id"], ["environment.id"]),
        sa.ForeignKeyConstraint(["evaluation_id"], ["compliance_evaluation.id"]),
        sa.ForeignKeyConstraint(["host_id"], ["host.id"]),
        sa.ForeignKeyConstraint(["policy_id"], ["compliance_policy.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_compliance_event_policy_id",
        "compliance_event",
        ["policy_id"],
        unique=False,
    )
    op.create_index(
        "ix_compliance_event_evaluation_id",
        "compliance_event",
        ["evaluation_id"],
        unique=False,
    )
    op.create_index(
        "ix_compliance_event_environment_id",
        "compliance_event",
        ["environment_id"],
        unique=False,
    )
    op.create_index(
        "ix_compliance_event_host_id",
        "compliance_event",
        ["host_id"],
        unique=False,
    )
    op.create_index(
        "ix_compliance_event_subject_key",
        "compliance_event",
        ["subject_key"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_compliance_event_subject_key", table_name="compliance_event")
    op.drop_index("ix_compliance_event_host_id", table_name="compliance_event")
    op.drop_index("ix_compliance_event_environment_id", table_name="compliance_event")
    op.drop_index("ix_compliance_event_evaluation_id", table_name="compliance_event")
    op.drop_index("ix_compliance_event_policy_id", table_name="compliance_event")
    op.drop_table("compliance_event")

    op.drop_index(
        "ix_compliance_evaluation_scope_key",
        table_name="compliance_evaluation",
    )
    op.drop_index(
        "ix_compliance_evaluation_subject_key",
        table_name="compliance_evaluation",
    )
    op.drop_index(
        "ix_compliance_evaluation_host_id",
        table_name="compliance_evaluation",
    )
    op.drop_index(
        "ix_compliance_evaluation_environment_id",
        table_name="compliance_evaluation",
    )
    op.drop_index(
        "ix_compliance_evaluation_policy_id",
        table_name="compliance_evaluation",
    )
    op.drop_table("compliance_evaluation")

    op.drop_index(
        "ix_compliance_policy_environment_id",
        table_name="compliance_policy",
    )
    op.drop_table("compliance_policy")
