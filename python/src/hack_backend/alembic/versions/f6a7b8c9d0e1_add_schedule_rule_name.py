"""add schedule rule name

Revision ID: f6a7b8c9d0e1
Revises: e4f2a6b7c8d9
Create Date: 2026-04-05 21:10:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "f6a7b8c9d0e1"
down_revision: str | Sequence[str] | None = "e4f2a6b7c8d9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "schedule_rule",
        sa.Column("name", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("schedule_rule", "name")
