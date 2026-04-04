"""Email verification code state

Revision ID: ee4c9e9f1f6a
Revises: dce0f45aceb2
Create Date: 2026-04-04 12:10:00.000000

"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "ee4c9e9f1f6a"
down_revision: str | Sequence[str] | None = "dce0f45aceb2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "user",
        sa.Column("email_verification_code_hash", sa.String(), nullable=True),
    )
    op.add_column(
        "user",
        sa.Column("email_verification_sent_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "user",
        sa.Column("email_verification_expires_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "user",
        sa.Column(
            "email_verification_resend_available_at",
            sa.DateTime(),
            nullable=True,
        ),
    )
    op.add_column(
        "user",
        sa.Column(
            "email_verification_attempt_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.alter_column(
        "user",
        "email_verification_attempt_count",
        server_default=None,
    )


def downgrade() -> None:
    op.drop_column("user", "email_verification_attempt_count")
    op.drop_column("user", "email_verification_resend_available_at")
    op.drop_column("user", "email_verification_expires_at")
    op.drop_column("user", "email_verification_sent_at")
    op.drop_column("user", "email_verification_code_hash")
