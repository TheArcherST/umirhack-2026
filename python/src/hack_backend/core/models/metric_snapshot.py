from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, CreatedAt
from .ids import new_id


class MetricSnapshot(Base):
    __tablename__ = "metric_snapshot"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    environment_id: Mapped[str] = mapped_column(
        ForeignKey("environment.id"),
        index=True,
    )
    host_id: Mapped[str] = mapped_column(ForeignKey("host.id"), index=True)
    metric_kind: Mapped[str]
    computed_at: Mapped[datetime]
    value_json: Mapped[dict[str, Any]] = mapped_column(JSON)
    created_at: Mapped[CreatedAt]
