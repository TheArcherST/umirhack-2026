from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, CreatedAt
from .ids import new_id


class GraphEdge(Base):
    __tablename__ = "graph_edge"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    environment_id: Mapped[str] = mapped_column(
        ForeignKey("environment.id"),
        index=True,
    )
    source_host_id: Mapped[str] = mapped_column(ForeignKey("host.id"), index=True)
    target_host_id: Mapped[str | None] = mapped_column(
        ForeignKey("host.id"),
        nullable=True,
    )
    target_label: Mapped[str | None] = mapped_column(nullable=True)
    relation_kind: Mapped[str]
    status: Mapped[str]
    observed_at: Mapped[datetime]
    expires_at: Mapped[datetime | None] = mapped_column(nullable=True)
    telemetry_record_id: Mapped[str | None] = mapped_column(
        ForeignKey("telemetry_record.id"),
        nullable=True,
    )
    payload_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[CreatedAt]
