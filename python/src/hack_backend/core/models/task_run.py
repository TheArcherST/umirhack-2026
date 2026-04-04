from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, CreatedAt
from .enums import TaskRunStatus
from .ids import new_id

if TYPE_CHECKING:
    from .agent import Agent
    from .host import Host
    from .task_template import TaskTemplate


class TaskRun(Base):
    __tablename__ = "task_run"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    environment_id: Mapped[str] = mapped_column(
        ForeignKey("environment.id"),
        index=True,
    )
    host_id: Mapped[str] = mapped_column(ForeignKey("host.id"), index=True)
    agent_id: Mapped[str] = mapped_column(ForeignKey("agent.id"), index=True)
    task_template_id: Mapped[str] = mapped_column(
        ForeignKey("task_template.id"),
        index=True,
    )
    schedule_rule_id: Mapped[str | None] = mapped_column(
        ForeignKey("schedule_rule.id"),
        nullable=True,
    )
    payload_override_json: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        default=dict,
    )
    status: Mapped[TaskRunStatus] = mapped_column(default=TaskRunStatus.QUEUED)
    lease_token: Mapped[str | None] = mapped_column(nullable=True)
    leased_until: Mapped[datetime | None] = mapped_column(nullable=True)
    attempt_no: Mapped[int] = mapped_column(default=0)
    queued_at: Mapped[CreatedAt]
    started_at: Mapped[datetime | None] = mapped_column(nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(nullable=True)
    failure_reason: Mapped[str | None] = mapped_column(Text(), nullable=True)

    task_template: Mapped["TaskTemplate"] = relationship(lazy="joined")
    host: Mapped["Host"] = relationship(lazy="joined")
    agent: Mapped["Agent"] = relationship(lazy="joined")
