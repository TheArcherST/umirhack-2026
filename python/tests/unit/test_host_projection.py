from __future__ import annotations

from datetime import UTC, datetime

import pytest

from hack_backend.core.models import Host
from hack_backend.core.platform_ops import update_host_projection


NOW = datetime(2026, 4, 4, 12, 0, tzinfo=UTC)


class FakeSession:
    def __init__(self, host: Host) -> None:
        self._host = host

    async def get(self, model, host_id: str) -> Host | None:
        if model is Host and host_id == self._host.id:
            return self._host
        return None


def make_host() -> Host:
    return Host(
        id="host-1",
        environment_id="env-1",
        agent_id="agent-1",
        name="host-1",
        internal_identifier="env-1:agent-1",
        descriptive_fields_json={},
        created_at=NOW,
    )


@pytest.mark.anyio
async def test_update_host_projection_prefers_non_loopback_addresses() -> None:
    host = make_host()

    await update_host_projection(
        FakeSession(host),
        host_id=host.id,
        telemetry_kind="host.ip_interfaces",
        payload={
            "interfaces": [
                {
                    "name": "lo",
                    "mac": None,
                    "ipv4": ["127.0.0.1"],
                    "ipv6": ["::1"],
                },
                {
                    "name": "eth0",
                    "mac": "00:11:22:33:44:55",
                    "ipv4": ["10.20.30.40"],
                    "ipv6": ["fd00::40"],
                },
            ]
        },
        collected_at=NOW,
    )

    assert host.primary_ipv4 == "10.20.30.40"
    assert host.primary_ipv6 == "fd00::40"
    assert host.descriptive_fields_json["interfaces"][0]["name"] == "lo"


@pytest.mark.anyio
async def test_update_host_projection_ignores_link_local_only_addresses() -> None:
    host = make_host()

    await update_host_projection(
        FakeSession(host),
        host_id=host.id,
        telemetry_kind="host.ip_interfaces",
        payload={
            "interfaces": [
                {
                    "name": "eth0",
                    "mac": "00:11:22:33:44:55",
                    "ipv4": ["169.254.10.20"],
                    "ipv6": ["fe80::1234"],
                }
            ]
        },
        collected_at=NOW,
    )

    assert host.primary_ipv4 is None
    assert host.primary_ipv6 is None
