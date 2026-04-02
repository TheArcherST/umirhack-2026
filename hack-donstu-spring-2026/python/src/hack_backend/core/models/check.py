from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from hack_backend.core.models.base import Base, CreatedAt

if TYPE_CHECKING:
    from .check_task import CheckTask


class Check(Base):
    """Thing that is intended to check if some is operational"""

    __tablename__ = "check"

    uid: Mapped[UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    payload: Mapped[dict] = mapped_column(JSON)

    created_at: Mapped[CreatedAt]
    acked_at: Mapped[datetime | None] = mapped_column()

    tasks: Mapped[list[CheckTask]] = relationship(lazy="selectin")
