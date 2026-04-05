from __future__ import annotations

import pytest

from hack_backend.core.compliance import normalize_policy_definition


def test_normalize_task_stream_policy_definition_compiles_regex_clauses() -> None:
    definition, compiled = normalize_policy_definition(
        entity_kind="task_stream",
        definition_json={
            "rules": [
                {
                    "label": "ping to alpha",
                    "task_kind": "network.endpoint_connectivity",
                    "input_pattern": "alpha\\.internal",
                    "input_negated": True,
                    "stdout_pattern": '"success": true',
                }
            ]
        },
        available_hosts=[],
    )

    assert definition["rules"][0] == {
        "id": "rule-1",
        "label": "ping to alpha",
        "task_kind": "network.endpoint_connectivity",
        "input_pattern": "alpha\\.internal",
        "input_negated": True,
        "stdout_pattern": '"success": true',
        "stdout_negated": False,
        "stderr_pattern": None,
        "stderr_negated": False,
    }
    assert compiled["rules"][0]["clauses"] == [
        {
            "field": "task_kind",
            "operator": "equals_ci",
            "value": "network.endpoint_connectivity",
        },
        {
            "field": "input_text",
            "operator": "regex_search",
            "value": "alpha\\.internal",
            "negated": True,
        },
        {
            "field": "stdout_text",
            "operator": "regex_search",
            "value": '"success": true',
            "negated": False,
        },
    ]


def test_normalize_task_stream_policy_definition_requires_one_stream_regex() -> None:
    with pytest.raises(ValueError, match="at least one stream regex"):
        normalize_policy_definition(
            entity_kind="task_stream",
            definition_json={
                "rules": [
                    {
                        "label": "kind only",
                        "task_kind": "network.endpoint_connectivity",
                    }
                ]
            },
            available_hosts=[],
        )


def test_normalize_task_stream_policy_definition_rejects_invalid_regex() -> None:
    with pytest.raises(ValueError, match="stdout_pattern must be a valid regular expression"):
        normalize_policy_definition(
            entity_kind="task_stream",
            definition_json={
                "rules": [
                    {
                        "label": "broken regex",
                        "stdout_pattern": "(",
                    }
                ]
            },
            available_hosts=[],
        )
