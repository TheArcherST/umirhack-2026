from __future__ import annotations

import pytest

from hack_backend.core.compliance import normalize_policy_definition
from hack_backend.core.models import Host


def _host(
    host_id: str,
    *,
    name: str,
    hostname: str | None = None,
    primary_ipv4: str | None = None,
) -> Host:
    return Host(
        id=host_id,
        environment_id="env-1",
        agent_id=f"agent-{host_id}",
        name=name,
        internal_identifier=f"env-1:{host_id}",
        hostname=hostname,
        primary_ipv4=primary_ipv4,
    )


def test_normalize_endpoint_policy_definition_compiles_host_selectors() -> None:
    definition, compiled = normalize_policy_definition(
        entity_kind="endpoint_connectivity",
        definition_json={
            "rules": [
                {
                    "label": "web to db",
                    "source_host_ids": ["host-a"],
                    "target_endpoint": "https://db.internal:443/health",
                    "connectivity": "reachable",
                    "max_latency_ms": 50,
                }
            ]
        },
        available_hosts=[
            _host("host-a", name="web", hostname="web.internal", primary_ipv4="10.0.0.10"),
            _host("host-b", name="db", hostname="db.internal", primary_ipv4="10.0.0.20"),
        ],
    )

    assert definition["rules"][0]["target_endpoint"] == "https://db.internal:443/health"
    assert compiled["rules"][0]["clauses"] == [
        {
            "field": "source_host",
            "operator": "host_selector",
            "value": {
                "host_ids": ["host-a"],
                "internal_identifiers": ["env-1:host-a"],
                "hostnames": ["web.internal"],
                "names": ["web"],
                "ip_addresses": ["10.0.0.10"],
            },
        },
        {
            "field": "target_endpoint_canonical",
            "operator": "equals_ci",
            "value": "db.internal",
        },
        {"field": "success", "operator": "bool_equals", "value": True},
        {"field": "latency_ms", "operator": "lte_number", "value": 50.0},
    ]


def test_normalize_service_policy_definition_rejects_unknown_host() -> None:
    with pytest.raises(ValueError, match="unknown host id"):
        normalize_policy_definition(
            entity_kind="service_status",
            definition_json={
                "rules": [
                    {
                        "label": "db service",
                        "host_ids": ["missing-host"],
                        "service_name": "postgresql.service",
                        "status": "running",
                    }
                ]
            },
            available_hosts=[
                _host("host-a", name="db", hostname="db.internal"),
            ],
        )


def test_normalize_command_output_policy_definition_compiles_regex_rule() -> None:
    definition, compiled = normalize_policy_definition(
        entity_kind="command_output",
        definition_json={
            "rules": [
                {
                    "label": "detect ubuntu",
                    "host_ids": ["host-a"],
                    "command_pattern": "os-release",
                    "output_pattern": "ubuntu",
                }
            ]
        },
        available_hosts=[
            _host("host-a", name="web", hostname="web.internal"),
        ],
    )

    assert definition["rules"][0]["output_pattern"] == "ubuntu"
    assert compiled["rules"][0]["clauses"][-1] == {
        "field": "output_text",
        "operator": "regex_search",
        "value": "ubuntu",
    }


def test_normalize_port_binding_policy_definition_compiles_range_and_subnet() -> None:
    definition, compiled = normalize_policy_definition(
        entity_kind="port_binding",
        definition_json={
            "rules": [
                {
                    "label": "public tcp listeners",
                    "host_ids": ["host-a"],
                    "protocol": "tcp",
                    "local_subnet": "10.0.0.0/24",
                    "state": "listening",
                    "port_from": 20,
                    "port_to": 30,
                }
            ]
        },
        available_hosts=[
            _host("host-a", name="web", hostname="web.internal"),
        ],
    )

    assert definition["rules"][0]["local_subnet"] == "10.0.0.0/24"
    assert compiled["rules"][0]["clauses"][-2:] == [
        {"field": "port", "operator": "gte_number", "value": 20},
        {"field": "port", "operator": "lte_number", "value": 30},
    ]
