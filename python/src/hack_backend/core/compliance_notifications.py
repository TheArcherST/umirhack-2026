from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

PENDING_COMPLIANCE_EMAIL_NOTIFICATIONS_KEY = "pending_compliance_email_notifications"


def queue_compliance_email_notification(
    session: AsyncSession,
    *,
    environment_id: str,
    policy_name: str,
    event_kind: str,
    event_origin: str,
    subject_label: str,
    happened_at: datetime,
    matched_rule_labels: list[str],
) -> None:
    pending = session.info.setdefault(
        PENDING_COMPLIANCE_EMAIL_NOTIFICATIONS_KEY,
        [],
    )
    pending.append(
        {
            "environment_id": environment_id,
            "policy_name": policy_name,
            "event_kind": event_kind,
            "event_origin": event_origin,
            "subject_label": subject_label,
            "happened_at": happened_at.isoformat(),
            "matched_rule_labels": list(matched_rule_labels),
        }
    )


def pop_pending_compliance_email_notifications(
    session: AsyncSession,
) -> list[dict[str, Any]]:
    pending = session.info.pop(PENDING_COMPLIANCE_EMAIL_NOTIFICATIONS_KEY, [])
    return [
        dict(item)
        for item in pending
        if isinstance(item, dict)
    ]
