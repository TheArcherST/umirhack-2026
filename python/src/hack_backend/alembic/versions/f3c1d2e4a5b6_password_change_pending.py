"""Add password change pending state to user

Revision ID: f3c1d2e4a5b6
Revises: 8a7e6f5d4c3b
Create Date: 2026-04-04 14:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "f3c1d2e4a5b6"
down_revision: str | Sequence[str] | None = "8a7e6f5d4c3b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "user",
        sa.Column("password_change_token_hash", sa.String(), nullable=True),
    )
    op.add_column(
        "user",
        sa.Column("password_change_new_hash", sa.String(), nullable=True),
    )
    op.add_column(
        "user",
        sa.Column("password_change_expires_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("user", "password_change_expires_at")
    op.drop_column("user", "password_change_new_hash")
    op.drop_column("user", "password_change_token_hash")
