from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, CreatedAt
from .enums import AgentStatus
from .ids import new_id


class Agent(Base):
    __tablename__ = "agent"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("project.id"), index=True)
    name: Mapped[str]
    registration_token_hash: Mapped[str | None] = mapped_column(nullable=True)
    declared_os: Mapped[str | None] = mapped_column(nullable=True)
    safe_install: Mapped[bool] = mapped_column(Boolean(), default=False)
    max_concurrent_tasks: Mapped[int] = mapped_column(Integer(), default=4)
    status: Mapped[AgentStatus] = mapped_column(default=AgentStatus.OFFLINE)
    last_seen_at: Mapped[datetime | None] = mapped_column(nullable=True)
    agent_version: Mapped[str | None] = mapped_column(nullable=True)
    reported_agent_version: Mapped[str | None] = mapped_column(nullable=True)
    capabilities_json: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        default=dict,
    )
    created_at: Mapped[CreatedAt]
