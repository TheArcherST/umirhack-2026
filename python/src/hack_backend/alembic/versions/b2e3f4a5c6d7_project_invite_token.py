"""Add invite token to project_member

Revision ID: b2e3f4a5c6d7
Revises: f3c1d2e4a5b6
Create Date: 2026-04-04 15:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "b2e3f4a5c6d7"
down_revision: str | Sequence[str] | None = "f3c1d2e4a5b6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "project_member",
        sa.Column("invite_token_hash", sa.String(), nullable=True),
    )
    op.add_column(
        "project_member",
        sa.Column("invite_expires_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("project_member", "invite_expires_at")
    op.drop_column("project_member", "invite_token_hash")
