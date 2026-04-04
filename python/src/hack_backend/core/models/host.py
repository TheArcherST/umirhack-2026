from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, CreatedAt
from .ids import new_id


class Host(Base):
    __tablename__ = "host"
    __table_args__ = (
        UniqueConstraint("environment_id", "agent_id", name="uq_host_env_agent"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    environment_id: Mapped[str] = mapped_column(
        ForeignKey("environment.id"),
        index=True,
    )
    agent_id: Mapped[str] = mapped_column(ForeignKey("agent.id"), index=True)
    kind: Mapped[str] = mapped_column(default="host")
    name: Mapped[str]
    internal_identifier: Mapped[str]
    descriptive_fields_json: Mapped[dict[str, Any]] = mapped_column(
        JSON,
        default=dict,
    )
    os_name: Mapped[str | None] = mapped_column(nullable=True)
    hostname: Mapped[str | None] = mapped_column(nullable=True)
    primary_ipv4: Mapped[str | None] = mapped_column(nullable=True)
    primary_ipv6: Mapped[str | None] = mapped_column(nullable=True)
    metadata_last_refreshed_at: Mapped[datetime | None] = mapped_column(
        nullable=True,
    )
    created_at: Mapped[CreatedAt]
