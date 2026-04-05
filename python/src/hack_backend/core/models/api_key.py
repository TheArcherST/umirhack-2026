import datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base
from .enums import ApiKeyRole
from .user import User


class ApiKey(Base):
    __tablename__ = "api_key"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    key_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    environment_id: Mapped[str] = mapped_column(ForeignKey("environment.id"), index=True)
    role: Mapped[ApiKeyRole] = mapped_column(Text, default=ApiKeyRole.OPERATOR)
    created_by: Mapped[int] = mapped_column(ForeignKey("user.id"))
    expires_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.timezone.utc),
    )

    environment = relationship("Environment", lazy="joined")
    creator = relationship("User", lazy="joined")

    @property
    def is_active(self) -> bool:
        if self.revoked_at is not None:
            return False
        if self.expires_at is not None and self.expires_at < datetime.datetime.now(datetime.timezone.utc):
            return False
        return True
