from __future__ import annotations

from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String
from datetime import datetime

from .base import Base, CreatedAt


class User(Base):
    __tablename__ = "user"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(unique=True)
    email: Mapped[str | None] = mapped_column(String(), nullable=True, unique=True)
    email_verified: Mapped[bool] = mapped_column(default=False)
    password_hash: Mapped[str]
    is_system: Mapped[bool] = mapped_column(default=False)
    otp_secret: Mapped[str | None] = mapped_column(
        String(),
        nullable=True,
    )
    email_verification_code_hash: Mapped[str | None] = mapped_column(
        String(),
        nullable=True,
    )
    email_verification_sent_at: Mapped[datetime | None] = mapped_column(
        nullable=True,
    )
    email_verification_expires_at: Mapped[datetime | None] = mapped_column(
        nullable=True,
    )
    email_verification_resend_available_at: Mapped[datetime | None] = (
        mapped_column(nullable=True)
    )
    email_verification_attempt_count: Mapped[int] = mapped_column(default=0)

    created_at: Mapped[CreatedAt]
