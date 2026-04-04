"""make username unique

Revision ID: d63308f075c8
Revises: e5a9b8c7d6f0
Create Date: 2026-04-04
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd63308f075c8'
down_revision: Union[str, None] = 'e5a9b8c7d6f0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_unique_constraint(None, 'user', ['username'])


def downgrade() -> None:
    op.drop_constraint(None, 'user', type_='unique')
