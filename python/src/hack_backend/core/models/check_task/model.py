import uuid
from datetime import datetime
from uuid import UUID

from sqlalchemy import JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..agent import Agent
from ..base import Base, CreatedAt


class CheckTask(Base):
    __tablename__ = "check_task"

    uid: Mapped[UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    check_uid: Mapped[UUID] = mapped_column(ForeignKey("check.uid"))
    payload: Mapped[dict] = mapped_column(JSON)
    result: Mapped[dict | None] = mapped_column(JSON)
    acked_at: Mapped[datetime | None] = mapped_column()
    failed_count: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[CreatedAt]

    bound_to_agent_id: Mapped[int] = mapped_column(ForeignKey("agent.id"))

    bound_to_agent: Mapped[Agent] = relationship(lazy="selectin")
