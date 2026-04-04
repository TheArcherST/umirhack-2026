"""add agent max concurrent tasks

Revision ID: c4a8d7e2f1b0
Revises: 91b4f6d2a7c1
Create Date: 2026-04-04 14:30:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "c4a8d7e2f1b0"
down_revision = "91b4f6d2a7c1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "agent",
        sa.Column(
            "max_concurrent_tasks",
            sa.Integer(),
            nullable=False,
            server_default="4",
        ),
    )


def downgrade() -> None:
    op.drop_column("agent", "max_concurrent_tasks")
