from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .agent_keypair import AgentKeypair
from .base import Base, CreatedAt

if TYPE_CHECKING:
    from .user import User


class AgentStatus(StrEnum):
    DOWN = "down"
    UP = "up"


class Agent(Base):
    __tablename__ = "agent"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column()
    ip: Mapped[str] = mapped_column()
    port: Mapped[int] = mapped_column()
    rhost: Mapped[str] = mapped_column()
    rport: Mapped[int] = mapped_column()
    is_suspended: Mapped[bool] = mapped_column(default=False)
    status: Mapped[AgentStatus] = mapped_column(default=AgentStatus.DOWN)
    created_at: Mapped[CreatedAt]

    keypair_id: Mapped[int] = mapped_column(ForeignKey("agent_keypair.id"))
    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("user.id"))

    keypair: Mapped[AgentKeypair] = relationship(lazy="selectin")
    created_by_user: Mapped[User] = relationship()
