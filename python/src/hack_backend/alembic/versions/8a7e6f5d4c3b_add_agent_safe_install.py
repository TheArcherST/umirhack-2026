"""add agent safe install flag

Revision ID: 8a7e6f5d4c3b
Revises: ee4c9e9f1f6a
Create Date: 2026-04-04 12:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "8a7e6f5d4c3b"
down_revision = "ee4c9e9f1f6a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "agent",
        sa.Column(
            "safe_install",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("agent", "safe_install")
