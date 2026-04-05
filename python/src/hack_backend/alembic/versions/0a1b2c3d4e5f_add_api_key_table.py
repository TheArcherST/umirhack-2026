"""add api_key table

Revision ID: 0a1b2c3d4e5f
Revises: 8a7e6f5d4c3b
Create Date: 2026-04-04 18:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0a1b2c3d4e5f"
down_revision = "8a7e6f5d4c3b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "api_key",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("key_hash", sa.String(64), nullable=False, unique=True, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("environment_id", sa.String(36), sa.ForeignKey("environment.id"), nullable=False, index=True),
        sa.Column("role", sa.Text(), nullable=False, server_default="operator"),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("user.id"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("api_key")
