"""refactor compliance history

Revision ID: b8c1d4e7f9a2
Revises: a6d9c3f8b1e2
Create Date: 2026-04-05 18:20:00.000000
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from alembic import op
import sqlalchemy as sa


revision = "b8c1d4e7f9a2"
down_revision = "a6d9c3f8b1e2"
branch_labels = None
depends_on = None


policy_table = sa.table(
    "compliance_policy",
    sa.column("id", sa.String(length=36)),
    sa.column("definition_json", sa.JSON()),
    sa.column("compiled_json", sa.JSON()),
    sa.column("created_at", sa.DateTime(timezone=True)),
    sa.column("current_revision_id", sa.String(length=36)),
)

revision_table = sa.table(
    "compliance_policy_revision",
    sa.column("id", sa.String(length=36)),
    sa.column("policy_id", sa.String(length=36)),
    sa.column("revision_no", sa.Integer()),
    sa.column("definition_json", sa.JSON()),
    sa.column("compiled_json", sa.JSON()),
    sa.column("created_by_user_id", sa.Integer()),
    sa.column("created_at", sa.DateTime(timezone=True)),
)

evaluation_table = sa.table(
    "compliance_evaluation",
    sa.column("id", sa.String(length=36)),
    sa.column("policy_id", sa.String(length=36)),
    sa.column("revision_id", sa.String(length=36)),
    sa.column("environment_id", sa.String(length=36)),
    sa.column("host_id", sa.String(length=36)),
    sa.column("entity_kind", sa.String()),
    sa.column("subject_key", sa.String()),
    sa.column("subject_label", sa.String()),
    sa.column("scope_key", sa.String()),
    sa.column("matched_rule_ids_json", sa.JSON()),
    sa.column("evidence_json", sa.JSON()),
    sa.column("observed_at", sa.DateTime(timezone=True)),
    sa.column("expires_at", sa.DateTime(timezone=True)),
    sa.column("is_violation", sa.Boolean()),
    sa.column("created_at", sa.DateTime(timezone=True)),
    sa.column("event_origin", sa.String(length=16)),
)

event_table = sa.table(
    "compliance_event",
    sa.column("id", sa.String(length=36)),
    sa.column("policy_id", sa.String(length=36)),
    sa.column("revision_id", sa.String(length=36)),
    sa.column("event_origin", sa.String(length=16)),
)

current_finding_table = sa.table(
    "compliance_current_finding",
    sa.column("id", sa.String(length=36)),
    sa.column("policy_id", sa.String(length=36)),
    sa.column("revision_id", sa.String(length=36)),
    sa.column("environment_id", sa.String(length=36)),
    sa.column("latest_evaluation_id", sa.String(length=36)),
    sa.column("host_id", sa.String(length=36)),
    sa.column("entity_kind", sa.String()),
    sa.column("subject_key", sa.String()),
    sa.column("subject_label", sa.String()),
    sa.column("scope_key", sa.String()),
    sa.column("matched_rule_ids_json", sa.JSON()),
    sa.column("evidence_json", sa.JSON()),
    sa.column("observed_at", sa.DateTime(timezone=True)),
    sa.column("expires_at", sa.DateTime(timezone=True)),
    sa.column("is_violation", sa.Boolean()),
    sa.column("created_at", sa.DateTime(timezone=True)),
)


def upgrade() -> None:
    op.create_table(
        "compliance_policy_revision",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("policy_id", sa.String(length=36), nullable=False),
        sa.Column("revision_no", sa.Integer(), nullable=False),
        sa.Column("definition_json", sa.JSON(), nullable=False),
        sa.Column("compiled_json", sa.JSON(), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["policy_id"], ["compliance_policy.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_compliance_policy_revision_policy_id",
        "compliance_policy_revision",
        ["policy_id"],
        unique=False,
    )
    op.create_index(
        "ix_compliance_policy_revision_created_by_user_id",
        "compliance_policy_revision",
        ["created_by_user_id"],
        unique=False,
    )

    op.add_column(
        "compliance_policy",
        sa.Column("current_revision_id", sa.String(length=36), nullable=True),
    )
    op.add_column(
        "compliance_policy",
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )

    bind = op.get_bind()
    policies = list(
        bind.execute(
            sa.select(
                policy_table.c.id,
                policy_table.c.definition_json,
                policy_table.c.compiled_json,
                policy_table.c.created_at,
            )
        ).mappings()
    )
    for policy in policies:
        revision_id = str(uuid4())
        created_at = policy["created_at"] or datetime.now(tz=UTC)
        bind.execute(
            revision_table.insert().values(
                id=revision_id,
                policy_id=policy["id"],
                revision_no=1,
                definition_json=policy["definition_json"] or {},
                compiled_json=policy["compiled_json"] or {},
                created_by_user_id=None,
                created_at=created_at,
            )
        )
        bind.execute(
            policy_table.update()
            .where(policy_table.c.id == policy["id"])
            .values(current_revision_id=revision_id)
        )

    op.create_index(
        "ix_compliance_policy_current_revision_id",
        "compliance_policy",
        ["current_revision_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_compliance_policy_current_revision_id",
        "compliance_policy",
        "compliance_policy_revision",
        ["current_revision_id"],
        ["id"],
    )

    op.add_column(
        "compliance_evaluation",
        sa.Column("revision_id", sa.String(length=36), nullable=True),
    )
    op.add_column(
        "compliance_evaluation",
        sa.Column("event_origin", sa.String(length=16), nullable=True),
    )
    op.create_index(
        "ix_compliance_evaluation_revision_id",
        "compliance_evaluation",
        ["revision_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_compliance_evaluation_revision_id",
        "compliance_evaluation",
        "compliance_policy_revision",
        ["revision_id"],
        ["id"],
    )

    bind.execute(
        sa.text(
            """
            UPDATE compliance_evaluation AS evaluation
            SET revision_id = policy.current_revision_id,
                event_origin = 'backfill'
            FROM compliance_policy AS policy
            WHERE evaluation.policy_id = policy.id
            """
        )
    )
    op.alter_column("compliance_evaluation", "revision_id", nullable=False)
    op.alter_column("compliance_evaluation", "event_origin", nullable=False)

    op.create_table(
        "compliance_current_finding",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("policy_id", sa.String(length=36), nullable=False),
        sa.Column("revision_id", sa.String(length=36), nullable=False),
        sa.Column("environment_id", sa.String(length=36), nullable=False),
        sa.Column("latest_evaluation_id", sa.String(length=36), nullable=False),
        sa.Column("host_id", sa.String(length=36), nullable=True),
        sa.Column("entity_kind", sa.String(), nullable=False),
        sa.Column("subject_key", sa.String(), nullable=False),
        sa.Column("subject_label", sa.String(), nullable=False),
        sa.Column("scope_key", sa.String(), nullable=True),
        sa.Column("matched_rule_ids_json", sa.JSON(), nullable=False),
        sa.Column("evidence_json", sa.JSON(), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_violation", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["environment_id"], ["environment.id"]),
        sa.ForeignKeyConstraint(
            ["latest_evaluation_id"],
            ["compliance_evaluation.id"],
        ),
        sa.ForeignKeyConstraint(["host_id"], ["host.id"]),
        sa.ForeignKeyConstraint(["policy_id"], ["compliance_policy.id"]),
        sa.ForeignKeyConstraint(
            ["revision_id"],
            ["compliance_policy_revision.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_compliance_current_finding_policy_id",
        "compliance_current_finding",
        ["policy_id"],
        unique=False,
    )
    op.create_index(
        "ix_compliance_current_finding_revision_id",
        "compliance_current_finding",
        ["revision_id"],
        unique=False,
    )
    op.create_index(
        "ix_compliance_current_finding_environment_id",
        "compliance_current_finding",
        ["environment_id"],
        unique=False,
    )
    op.create_index(
        "ix_compliance_current_finding_latest_evaluation_id",
        "compliance_current_finding",
        ["latest_evaluation_id"],
        unique=False,
    )
    op.create_index(
        "ix_compliance_current_finding_host_id",
        "compliance_current_finding",
        ["host_id"],
        unique=False,
    )
    op.create_index(
        "ix_compliance_current_finding_subject_key",
        "compliance_current_finding",
        ["subject_key"],
        unique=False,
    )
    op.create_index(
        "ix_compliance_current_finding_scope_key",
        "compliance_current_finding",
        ["scope_key"],
        unique=False,
    )

    evaluations = list(
        bind.execute(
            sa.select(
                evaluation_table.c.id,
                evaluation_table.c.policy_id,
                evaluation_table.c.revision_id,
                evaluation_table.c.environment_id,
                evaluation_table.c.host_id,
                evaluation_table.c.entity_kind,
                evaluation_table.c.subject_key,
                evaluation_table.c.subject_label,
                evaluation_table.c.scope_key,
                evaluation_table.c.matched_rule_ids_json,
                evaluation_table.c.evidence_json,
                evaluation_table.c.observed_at,
                evaluation_table.c.expires_at,
                evaluation_table.c.is_violation,
                evaluation_table.c.created_at,
            ).order_by(
                evaluation_table.c.policy_id.asc(),
                evaluation_table.c.subject_key.asc(),
                evaluation_table.c.observed_at.desc(),
                evaluation_table.c.created_at.desc(),
                evaluation_table.c.id.desc(),
            )
        ).mappings()
    )
    seen_subjects: set[tuple[str, str]] = set()
    for evaluation in evaluations:
        key = (evaluation["policy_id"], evaluation["subject_key"])
        if key in seen_subjects:
            continue
        seen_subjects.add(key)
        bind.execute(
            current_finding_table.insert().values(
                id=str(uuid4()),
                policy_id=evaluation["policy_id"],
                revision_id=evaluation["revision_id"],
                environment_id=evaluation["environment_id"],
                latest_evaluation_id=evaluation["id"],
                host_id=evaluation["host_id"],
                entity_kind=evaluation["entity_kind"],
                subject_key=evaluation["subject_key"],
                subject_label=evaluation["subject_label"],
                scope_key=evaluation["scope_key"],
                matched_rule_ids_json=evaluation["matched_rule_ids_json"] or [],
                evidence_json=evaluation["evidence_json"] or {},
                observed_at=evaluation["observed_at"],
                expires_at=evaluation["expires_at"],
                is_violation=bool(evaluation["is_violation"]),
                created_at=evaluation["created_at"] or datetime.now(tz=UTC),
            )
        )

    op.add_column(
        "compliance_event",
        sa.Column("revision_id", sa.String(length=36), nullable=True),
    )
    op.add_column(
        "compliance_event",
        sa.Column("event_origin", sa.String(length=16), nullable=True),
    )
    op.create_index(
        "ix_compliance_event_revision_id",
        "compliance_event",
        ["revision_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_compliance_event_revision_id",
        "compliance_event",
        "compliance_policy_revision",
        ["revision_id"],
        ["id"],
    )
    bind.execute(
        sa.text(
            """
            UPDATE compliance_event AS event
            SET revision_id = policy.current_revision_id,
                event_origin = 'backfill'
            FROM compliance_policy AS policy
            WHERE event.policy_id = policy.id
            """
        )
    )
    op.alter_column("compliance_event", "revision_id", nullable=False)
    op.alter_column("compliance_event", "event_origin", nullable=False)

    op.drop_column("compliance_policy", "compiled_json")
    op.drop_column("compliance_policy", "definition_json")


def downgrade() -> None:
    op.add_column(
        "compliance_policy",
        sa.Column("definition_json", sa.JSON(), nullable=True),
    )
    op.add_column(
        "compliance_policy",
        sa.Column("compiled_json", sa.JSON(), nullable=True),
    )

    bind = op.get_bind()
    policy_revisions = list(
        bind.execute(
            sa.select(
                policy_table.c.id,
                policy_table.c.current_revision_id,
                revision_table.c.definition_json,
                revision_table.c.compiled_json,
            ).select_from(
                policy_table.join(
                    revision_table,
                    policy_table.c.current_revision_id == revision_table.c.id,
                    isouter=True,
                )
            )
        ).mappings()
    )
    for row in policy_revisions:
        bind.execute(
            policy_table.update()
            .where(policy_table.c.id == row["id"])
            .values(
                definition_json=row["definition_json"] or {},
                compiled_json=row["compiled_json"] or {},
            )
        )

    op.alter_column("compliance_policy", "definition_json", nullable=False)
    op.alter_column("compliance_policy", "compiled_json", nullable=False)

    op.drop_constraint(
        "fk_compliance_event_revision_id",
        "compliance_event",
        type_="foreignkey",
    )
    op.drop_index("ix_compliance_event_revision_id", table_name="compliance_event")
    op.drop_column("compliance_event", "event_origin")
    op.drop_column("compliance_event", "revision_id")

    op.drop_index(
        "ix_compliance_current_finding_scope_key",
        table_name="compliance_current_finding",
    )
    op.drop_index(
        "ix_compliance_current_finding_subject_key",
        table_name="compliance_current_finding",
    )
    op.drop_index(
        "ix_compliance_current_finding_host_id",
        table_name="compliance_current_finding",
    )
    op.drop_index(
        "ix_compliance_current_finding_latest_evaluation_id",
        table_name="compliance_current_finding",
    )
    op.drop_index(
        "ix_compliance_current_finding_environment_id",
        table_name="compliance_current_finding",
    )
    op.drop_index(
        "ix_compliance_current_finding_revision_id",
        table_name="compliance_current_finding",
    )
    op.drop_index(
        "ix_compliance_current_finding_policy_id",
        table_name="compliance_current_finding",
    )
    op.drop_table("compliance_current_finding")

    op.drop_constraint(
        "fk_compliance_evaluation_revision_id",
        "compliance_evaluation",
        type_="foreignkey",
    )
    op.drop_index(
        "ix_compliance_evaluation_revision_id",
        table_name="compliance_evaluation",
    )
    op.drop_column("compliance_evaluation", "event_origin")
    op.drop_column("compliance_evaluation", "revision_id")

    op.drop_constraint(
        "fk_compliance_policy_current_revision_id",
        "compliance_policy",
        type_="foreignkey",
    )
    op.drop_index(
        "ix_compliance_policy_current_revision_id",
        table_name="compliance_policy",
    )
    op.drop_column("compliance_policy", "deleted_at")
    op.drop_column("compliance_policy", "current_revision_id")

    op.drop_index(
        "ix_compliance_policy_revision_created_by_user_id",
        table_name="compliance_policy_revision",
    )
    op.drop_index(
        "ix_compliance_policy_revision_policy_id",
        table_name="compliance_policy_revision",
    )
    op.drop_table("compliance_policy_revision")
