from __future__ import annotations

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, CreatedAt
from .ids import new_id


class Project(Base):
    __tablename__ = "project"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str]
    owner_id: Mapped[int] = mapped_column(ForeignKey("user.id"))
    created_at: Mapped[CreatedAt]
