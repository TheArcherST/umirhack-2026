from __future__ import annotations

from typing import Any

from sqlalchemy import JSON, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, CreatedAt


class TaskRunResult(Base):
    __tablename__ = "task_run_result"

    task_run_id: Mapped[str] = mapped_column(
        ForeignKey("task_run.id"),
        primary_key=True,
    )
    exit_code: Mapped[int | None] = mapped_column(nullable=True)
    stdout_text: Mapped[str | None] = mapped_column(Text(), nullable=True)
    stderr_text: Mapped[str | None] = mapped_column(Text(), nullable=True)
    summary_json: Mapped[dict[str, Any] | None] = mapped_column(
        JSON,
        nullable=True,
    )
    created_at: Mapped[CreatedAt]
