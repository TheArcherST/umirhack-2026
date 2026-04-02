from __future__ import annotations

from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, CreatedAt


class User(Base):
    __tablename__ = "user"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(unique=True)
    password_hash: Mapped[str]
    is_system: Mapped[bool] = mapped_column(default=False)

    created_at: Mapped[CreatedAt]
