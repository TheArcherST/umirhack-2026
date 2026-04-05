from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, CreatedAt
from .ids import new_id

if TYPE_CHECKING:
    from .task_template import TaskTemplate


class ScheduleRule(Base):
    __tablename__ = "schedule_rule"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    environment_id: Mapped[str] = mapped_column(
        ForeignKey("environment.id"),
        index=True,
    )
    task_template_id: Mapped[str] = mapped_column(
        ForeignKey("task_template.id"),
        index=True,
    )
    name: Mapped[str | None] = mapped_column(nullable=True)
    cron_expr: Mapped[str]
    target_selector_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    is_enabled: Mapped[bool] = mapped_column(default=True)
    next_run_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[CreatedAt]

    task_template: Mapped["TaskTemplate"] = relationship(lazy="joined")
