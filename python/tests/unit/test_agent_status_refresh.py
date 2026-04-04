from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

import pytest

from hack_backend.core.models import Agent, AgentStatus
from hack_backend.core.platform_ops import refresh_agent_state


NOW = datetime(2026, 4, 4, 12, 0, tzinfo=UTC)


class FakeScalars:
    def __init__(self, values):
        self._values = values

    def __iter__(self):
        return iter(self._values)


class FakeSession:
    def __init__(self, agents):
        self._agents = agents

    async def scalars(self, _query):
        return FakeScalars(self._agents)


def test_refresh_agent_state_marks_agents_online_stale_and_offline(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("hack_backend.core.platform_ops.utcnow", lambda: NOW)

    online_agent = Agent(
        id="agent-online",
        project_id="project-1",
        name="online",
        status=AgentStatus.OFFLINE,
        last_seen_at=NOW - timedelta(seconds=10),
        created_at=NOW,
    )
    stale_agent = Agent(
        id="agent-stale",
        project_id="project-1",
        name="stale",
        status=AgentStatus.ONLINE,
        last_seen_at=NOW - timedelta(seconds=31),
        created_at=NOW,
    )
    offline_agent = Agent(
        id="agent-offline",
        project_id="project-1",
        name="offline",
        status=AgentStatus.ONLINE,
        last_seen_at=NOW - timedelta(minutes=5, seconds=1),
        created_at=NOW,
    )
    unknown_agent = Agent(
        id="agent-unknown",
        project_id="project-1",
        name="unknown",
        status=AgentStatus.ONLINE,
        last_seen_at=None,
        created_at=NOW,
    )

    asyncio.run(
        refresh_agent_state(
            FakeSession([online_agent, stale_agent, offline_agent, unknown_agent])
        )
    )

    assert online_agent.status == AgentStatus.ONLINE
    assert stale_agent.status == AgentStatus.STALE
    assert offline_agent.status == AgentStatus.OFFLINE
    assert unknown_agent.status == AgentStatus.OFFLINE
