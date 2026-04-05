from __future__ import annotations

import pytest

from hack_backend.core.compliance import (
    _evaluate_compiled_policy,
    normalize_policy_definition,
)
from hack_backend.core.models.enums import ComplianceMode


def test_normalize_task_stream_policy_definition_compiles_regex_clauses() -> None:
    definition, compiled = normalize_policy_definition(
        entity_kind="task_stream",
        definition_json={
            "forbids": [
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

    assert definition["requirements"] == []
    assert definition["forbids"][0] == {
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
    assert compiled["requirements"] == []
    assert compiled["forbids"][0]["clauses"] == [
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
                "forbids": [
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
                "forbids": [
                    {
                        "label": "broken regex",
                        "stdout_pattern": "(",
                    }
                ]
            },
            available_hosts=[],
        )


def test_evaluate_compiled_policy_enforces_requirements_and_forbids() -> None:
    _, compiled = normalize_policy_definition(
        entity_kind="task_stream",
        definition_json={
            "requirements": [
                {
                    "label": "nginx welcome banner",
                    "stdout_pattern": "Welcome to nginx",
                }
            ],
            "forbids": [
                {
                    "label": "unknown host",
                    "stderr_pattern": "Unknown host",
                }
            ],
        },
        available_hosts=[],
    )

    is_violation, violated_rule_ids = _evaluate_compiled_policy(
        compiled_json=compiled,
        mode=ComplianceMode.BLACKLIST,
        entity_values={
            "task_kind": "diagnostic.command.custom",
            "input_text": "curl https://example.internal",
            "stdout_text": "HTTP/1.1 200 OK\nWelcome to nginx!",
            "stderr_text": "",
        },
    )
    assert is_violation is False
    assert violated_rule_ids == []

    is_violation, violated_rule_ids = _evaluate_compiled_policy(
        compiled_json=compiled,
        mode=ComplianceMode.BLACKLIST,
        entity_values={
            "task_kind": "diagnostic.command.custom",
            "input_text": "curl https://example.internal",
            "stdout_text": "HTTP/1.1 200 OK",
            "stderr_text": "Unknown host",
        },
    )
    assert is_violation is True
    assert violated_rule_ids == ["rule-1", "rule-2"]
