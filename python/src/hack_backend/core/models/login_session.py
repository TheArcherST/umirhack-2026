import uuid
from uuid import UUID

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, CreatedAt
from .user import User


class LoginSession(Base):
    __tablename__ = "login_session"

    uid: Mapped[UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_agent: Mapped[str | None]
    token: Mapped[str]
    created_at: Mapped[CreatedAt]

    user_id: Mapped[int] = mapped_column(ForeignKey("user.id"))

    user: Mapped[User] = relationship(lazy="joined")
