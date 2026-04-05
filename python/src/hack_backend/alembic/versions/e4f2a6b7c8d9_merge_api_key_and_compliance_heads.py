"""merge api key and compliance heads

Revision ID: e4f2a6b7c8d9
Revises: 0a1b2c3d4e5f, b8c1d4e7f9a2
Create Date: 2026-04-05 20:15:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence


revision: str = "e4f2a6b7c8d9"
down_revision: str | Sequence[str] | None = (
    "0a1b2c3d4e5f",
    "b8c1d4e7f9a2",
)
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
