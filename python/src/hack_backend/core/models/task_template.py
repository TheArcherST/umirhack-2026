from __future__ import annotations

from typing import Any

from sqlalchemy import JSON, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, CreatedAt
from .ids import new_id


class TaskTemplate(Base):
    __tablename__ = "task_template"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("project.id"), index=True)
    kind: Mapped[str]
    schema_version: Mapped[int] = mapped_column(default=1)
    name: Mapped[str]
    payload_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    metric_policy_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    approved_command: Mapped[str | None] = mapped_column(Text(), nullable=True)
    created_at: Mapped[CreatedAt]
