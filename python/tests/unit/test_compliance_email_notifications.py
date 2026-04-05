from __future__ import annotations

from datetime import datetime

import pytest

from hack_backend.core.compliance_notifications import (
    PENDING_COMPLIANCE_EMAIL_NOTIFICATIONS_KEY,
    queue_compliance_email_notification,
)
from hack_backend.rest_server import compliance_notifications as compliance_notifications_module
from hack_backend.rest_server.compliance_notifications import (
    dispatch_pending_compliance_email_notifications,
)


class _FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return list(self._rows)


class _FakeSession:
    def __init__(self, rows):
        self.info = {}
        self._rows = rows

    async def execute(self, stmt):  # noqa: ARG002
        return _FakeResult(self._rows)


@pytest.mark.anyio
async def test_dispatch_pending_compliance_email_notifications_filters_recipients(
    monkeypatch,
) -> None:
    session = _FakeSession(
        [
            ("env-1", "operator@example.com", "alice", "Prod"),
            ("env-1", "observer@example.com", "bob", "Prod"),
        ]
    )
    queue_compliance_email_notification(
        session,  # type: ignore[arg-type]
        environment_id="env-1",
        policy_name="Custom command policy",
        event_kind="rise",
        event_origin="live",
        subject_label="alpha-host: diagnostic.command.custom",
        happened_at=datetime(2026, 4, 5, 12, 0),
        matched_rule_labels=["stdout suspicious"],
    )
    queue_compliance_email_notification(
        session,  # type: ignore[arg-type]
        environment_id="env-2",
        policy_name="Ignored policy",
        event_kind="resolved",
        event_origin="backfill",
        subject_label="ignored",
        happened_at=datetime(2026, 4, 5, 12, 5),
        matched_rule_labels=[],
    )

    sent: list[dict[str, object]] = []

    async def fake_kiq(**kwargs) -> None:
        sent.append(kwargs)

    monkeypatch.setattr(
        compliance_notifications_module.send_compliance_event_email_task,
        "kiq",
        fake_kiq,
    )

    await dispatch_pending_compliance_email_notifications(session)  # type: ignore[arg-type]

    assert session.info.get(PENDING_COMPLIANCE_EMAIL_NOTIFICATIONS_KEY) is None
    assert sent == [
        {
            "email_address": "operator@example.com",
            "user_name": "alice",
            "environment_name": "Prod",
            "environment_id": "env-1",
            "policy_name": "Custom command policy",
            "event_kind": "rise",
            "event_origin": "live",
            "subject_label": "alpha-host: diagnostic.command.custom",
            "happened_at": "2026-04-05T12:00:00",
            "matched_rule_labels": ["stdout suspicious"],
        },
        {
            "email_address": "observer@example.com",
            "user_name": "bob",
            "environment_name": "Prod",
            "environment_id": "env-1",
            "policy_name": "Custom command policy",
            "event_kind": "rise",
            "event_origin": "live",
            "subject_label": "alpha-host: diagnostic.command.custom",
            "happened_at": "2026-04-05T12:00:00",
            "matched_rule_labels": ["stdout suspicious"],
        },
    ]
