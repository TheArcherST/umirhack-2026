from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, CreatedAt
from .ids import new_id


class TelemetryRecord(Base):
    __tablename__ = "telemetry_record"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    task_run_id: Mapped[str] = mapped_column(
        ForeignKey("task_run.id"),
        unique=True,
        index=True,
    )
    environment_id: Mapped[str] = mapped_column(
        ForeignKey("environment.id"),
        index=True,
    )
    host_id: Mapped[str] = mapped_column(ForeignKey("host.id"), index=True)
    kind: Mapped[str]
    schema_version: Mapped[int] = mapped_column(default=1)
    collected_at: Mapped[datetime]
    payload_json: Mapped[dict[str, Any]] = mapped_column(JSON)
    payload_hash: Mapped[str]
    size_bytes: Mapped[int]
    created_at: Mapped[CreatedAt]
