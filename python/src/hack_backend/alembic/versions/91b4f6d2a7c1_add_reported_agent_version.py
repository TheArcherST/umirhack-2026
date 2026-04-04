"""add reported agent version

Revision ID: 91b4f6d2a7c1
Revises: b2e3f4a5c6d7
Create Date: 2026-04-04 16:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "91b4f6d2a7c1"
down_revision = "b2e3f4a5c6d7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "agent",
        sa.Column("reported_agent_version", sa.String(), nullable=True),
    )
    op.execute(
        sa.text(
            """
            UPDATE agent
            SET reported_agent_version = agent_version
            WHERE agent_version IS NOT NULL
            """
        )
    )


def downgrade() -> None:
    op.drop_column("agent", "reported_agent_version")
