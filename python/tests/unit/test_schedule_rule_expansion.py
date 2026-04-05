from __future__ import annotations

from datetime import UTC, datetime

import pytest

from hack_backend.core.models import ScheduleRule
from hack_backend.core.platform_ops import expand_schedule_rules


NOW = datetime(2026, 4, 5, 12, 0, tzinfo=UTC)


class FakeScalars:
    def __init__(self, values):
        self._values = values

    def __iter__(self):
        return iter(self._values)


class FakeSession:
    def __init__(self, rules: list[ScheduleRule]) -> None:
        self._rules = rules

    async def scalars(self, _query):
        return FakeScalars(self._rules)

    async def flush(self) -> None:
        return None


@pytest.mark.anyio
async def test_expand_schedule_rules_handles_naive_next_run_at(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _resolve_schedule_hosts(*args, **kwargs):
        return []

    monkeypatch.setattr("hack_backend.core.platform_ops.utcnow", lambda: NOW)
    monkeypatch.setattr(
        "hack_backend.core.platform_ops.resolve_schedule_hosts",
        _resolve_schedule_hosts,
    )

    rule = ScheduleRule(
        id="rule-1",
        environment_id="env-1",
        task_template_id="tmpl-1",
        cron_expr="* * * * *",
        target_selector_json={},
        is_enabled=True,
        next_run_at=datetime(2026, 4, 5, 11, 59),
        created_at=NOW,
    )

    created = await expand_schedule_rules(FakeSession([rule]))

    assert created == 0
    assert rule.next_run_at == datetime(2026, 4, 5, 12, 0, tzinfo=UTC)
