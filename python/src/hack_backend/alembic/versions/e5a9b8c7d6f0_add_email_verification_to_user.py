"""add email verification columns to user

Revision ID: e5a9b8c7d6f0
Revises: 140f8250dfe5
Create Date: 2026-04-03 12:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e5a9b8c7d6f0"
down_revision: str | Sequence[str] | None = "140f8250dfe5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "user",
        sa.Column("email", sa.String(), nullable=True),
    )
    op.add_column(
        "user",
        sa.Column("email_verified", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "user",
        sa.Column("otp_secret", sa.String(), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("user", "otp_secret")
    op.drop_column("user", "email_verified")
    op.drop_column("user", "email")
