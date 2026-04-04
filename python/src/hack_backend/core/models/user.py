from __future__ import annotations

from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String

from .base import Base, CreatedAt


class User(Base):
    __tablename__ = "user"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(unique=True)
    email: Mapped[str | None] = mapped_column(String(), nullable=True)
    email_verified: Mapped[bool] = mapped_column(default=False)
    password_hash: Mapped[str]
    is_system: Mapped[bool] = mapped_column(default=False)
    otp_secret: Mapped[str | None] = mapped_column(
        String(),
        nullable=True,
    )

    created_at: Mapped[CreatedAt]
