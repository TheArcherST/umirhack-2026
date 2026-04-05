from __future__ import annotations

import json
from typing import Any


def _template_id_for_kind(templates: list[dict[str, Any]], kind: str) -> str:
    for template in templates:
        if template["kind"] == kind:
            return template["id"]
    raise AssertionError(f"Missing template for kind {kind}")


def _complete_success(
    api,
    *,
    agent,
    lease: dict[str, Any],
    telemetry_kind: str,
    telemetry_payload: dict[str, Any],
    summary_json: dict[str, Any] | None = None,
) -> None:
    api.mark_task_running(
        agent=agent,
        task_run_id=lease["id"],
        lease_token=lease["lease_token"],
    )
    api.complete_task(
        agent=agent,
        task_run_id=lease["id"],
        payload={
            "lease_token": lease["lease_token"],
            "status": "succeeded",
            "exit_code": 0,
            "stdout_text": json.dumps(telemetry_payload, sort_keys=True),
            "stderr_text": "",
            "summary_json": summary_json or {"telemetry_kind": telemetry_kind},
            "telemetry_kind": telemetry_kind,
            "telemetry_payload": telemetry_payload,
            "failure_reason": None,
        },
    )


def test_compliance_materializes_task_stream_policy(api) -> None:
    owner = api.register_user(prefix="compliance-owner")
    bundle = api.create_project_bundle(
        user=owner,
        project_name="Compliance Fleet",
    )
    created_agent = api.create_agent(
        user=owner,
        project_id=bundle.project["id"],
        environment_id=bundle.environment["id"],
        name="alpha-agent",
    )
    bootstrap_token = api.issue_install_token(
        user=owner,
        agent_id=created_agent["id"],
    )
    agent = api.register_agent(bootstrap_token=bootstrap_token)

    bootstrap_leases = api.poll_agent(agent=agent)
    leases_by_kind = {
        lease["task_template"]["kind"]: lease for lease in bootstrap_leases
    }
    _complete_success(
        api,
        agent=agent,
        lease=leases_by_kind["host.system_profile"],
        telemetry_kind="host.system_profile",
        telemetry_payload={
            "hostname": "alpha.internal",
            "os_name": "linux",
            "platform_version": "ubuntu-24.04",
            "kernel": "6.8.0",
            "cpu_model": "Xeon Platinum",
        },
    )
    _complete_success(
        api,
        agent=agent,
        lease=leases_by_kind["host.ip_interfaces"],
        telemetry_kind="host.ip_interfaces",
        telemetry_payload={
            "interfaces": [
                {
                    "name": "eth0",
                    "mac": "00:11:22:33:44:55",
                    "ipv4": ["10.20.30.40"],
                    "ipv6": ["fd00::40"],
                }
            ]
        },
    )
    _complete_success(
        api,
        agent=agent,
        lease=leases_by_kind["diagnostic.command.service_status"],
        telemetry_kind="diagnostic.command.service_status",
        telemetry_payload={
            "command": "systemctl list-units --type=service --state=running --no-pager",
            "sample": "",
            "services": [],
        },
    )

    hosts_response = api.client.get(
        f"/environments/{bundle.environment['id']}/hosts",
        headers=owner.headers,
    )
    assert hosts_response.status_code == 200, hosts_response.text
    host = hosts_response.json()[0]

    connectivity_template_id = _template_id_for_kind(
        bundle.templates,
        "network.endpoint_connectivity",
    )
    create_task_runs = api.client.post(
        "/task-runs",
        json={
            "environment_id": bundle.environment["id"],
            "host_ids": [host["id"]],
            "task_template_id": connectivity_template_id,
            "payload_overrides": {"target_endpoint": "alpha.internal"},
        },
        headers=owner.headers,
    )
    assert create_task_runs.status_code == 201, create_task_runs.text

    connectivity_lease = api.poll_agent(agent=agent)[0]
    _complete_success(
        api,
        agent=agent,
        lease=connectivity_lease,
        telemetry_kind="network.endpoint_connectivity",
        telemetry_payload={
            "target_endpoint": "alpha.internal",
            "success": True,
            "latency_ms": 12.5,
        },
        summary_json={"target_endpoint": "alpha.internal"},
    )

    policy_response = api.client.post(
        "/compliance/policies",
        json={
            "environment_id": bundle.environment["id"],
            "name": "Block alpha ping",
            "entity_kind": "task_stream",
            "mode": "blacklist",
            "description": "Detect connectivity checks to alpha.internal",
            "definition_json": {
                "forbids": [
                    {
                        "label": "alpha connectivity",
                        "task_kind": "network.endpoint_connectivity",
                        "window_minutes": 60,
                        "input_pattern": "alpha\\.internal",
                        "stdout_pattern": '"success": true',
                        "stderr_pattern": "timeout",
                        "stderr_negated": True,
                    }
                ]
            },
        },
        headers=owner.headers,
    )
    assert policy_response.status_code == 201, policy_response.text
    assert policy_response.json()["revision_no"] == 1

    findings_response = api.client.get(
        f"/environments/{bundle.environment['id']}/compliance/findings",
        headers=owner.headers,
    )
    assert findings_response.status_code == 200, findings_response.text
    findings = findings_response.json()
    assert len(findings) == 1
    assert findings[0]["policy_name"] == "Block alpha ping"
    assert findings[0]["matched_rule_labels"] == ["alpha connectivity"]
    assert findings[0]["subject_label"].endswith("network.endpoint_connectivity")

    events_response = api.client.get(
        f"/environments/{bundle.environment['id']}/compliance/events",
        headers=owner.headers,
    )
    assert events_response.status_code == 200, events_response.text
    events = events_response.json()
    assert len(events) == 1
    assert events[0]["event_kind"] == "rise"
    assert events[0]["event_origin"] == "backfill"

    patched_policy_response = api.client.patch(
        f"/compliance/policies/{policy_response.json()['id']}",
        json={
            "definition_json": {
                "forbids": [
                    {
                        "label": "alpha connectivity v2",
                        "task_kind": "network.endpoint_connectivity",
                        "window_minutes": 60,
                        "input_pattern": "alpha\\.internal",
                        "stdout_pattern": '"success": true',
                        "stderr_pattern": "timeout",
                        "stderr_negated": True,
                    }
                ]
            }
        },
        headers=owner.headers,
    )
    assert patched_policy_response.status_code == 200, patched_policy_response.text
    assert patched_policy_response.json()["revision_no"] == 2

    findings_response = api.client.get(
        f"/environments/{bundle.environment['id']}/compliance/findings",
        headers=owner.headers,
    )
    findings = findings_response.json()
    assert len(findings) == 1
    assert findings[0]["matched_rule_labels"] == ["alpha connectivity v2"]

    events_response = api.client.get(
        f"/environments/{bundle.environment['id']}/compliance/events",
        headers=owner.headers,
    )
    events = events_response.json()
    assert len(events) == 1
    assert events[0]["event_kind"] == "rise"
    assert events[0]["event_origin"] == "backfill"

    create_task_runs = api.client.post(
        "/task-runs",
        json={
            "environment_id": bundle.environment["id"],
            "host_ids": [host["id"]],
            "task_template_id": connectivity_template_id,
            "payload_overrides": {"target_endpoint": "db.internal"},
        },
        headers=owner.headers,
    )
    assert create_task_runs.status_code == 201, create_task_runs.text

    connectivity_lease = api.poll_agent(agent=agent)[0]
    _complete_success(
        api,
        agent=agent,
        lease=connectivity_lease,
        telemetry_kind="network.endpoint_connectivity",
        telemetry_payload={
            "target_endpoint": "db.internal",
            "success": True,
            "latency_ms": 10.0,
        },
        summary_json={"target_endpoint": "db.internal"},
    )

    findings_response = api.client.get(
        f"/environments/{bundle.environment['id']}/compliance/findings",
        headers=owner.headers,
    )
    findings = findings_response.json()
    assert len(findings) == 1
    assert findings[0]["matched_rule_labels"] == ["alpha connectivity v2"]

    events_response = api.client.get(
        f"/environments/{bundle.environment['id']}/compliance/events",
        headers=owner.headers,
    )
    events = events_response.json()
    assert len(events) == 1
    assert events[0]["event_kind"] == "rise"
    assert events[0]["event_origin"] == "backfill"


def test_compliance_materializes_requirements_policy(api) -> None:
    owner = api.register_user(prefix="compliance-require")
    bundle = api.create_project_bundle(
        user=owner,
        project_name="Compliance Requirements",
    )
    created_agent = api.create_agent(
        user=owner,
        project_id=bundle.project["id"],
        environment_id=bundle.environment["id"],
        name="require-agent",
    )
    bootstrap_token = api.issue_install_token(
        user=owner,
        agent_id=created_agent["id"],
    )
    agent = api.register_agent(bootstrap_token=bootstrap_token)

    bootstrap_leases = api.poll_agent(agent=agent)
    leases_by_kind = {
        lease["task_template"]["kind"]: lease for lease in bootstrap_leases
    }
    _complete_success(
        api,
        agent=agent,
        lease=leases_by_kind["host.system_profile"],
        telemetry_kind="host.system_profile",
        telemetry_payload={
            "hostname": "require.internal",
            "os_name": "linux",
            "platform_version": "ubuntu-24.04",
            "kernel": "6.8.0",
            "cpu_model": "Xeon Platinum",
        },
    )
    _complete_success(
        api,
        agent=agent,
        lease=leases_by_kind["host.ip_interfaces"],
        telemetry_kind="host.ip_interfaces",
        telemetry_payload={
            "interfaces": [
                {
                    "name": "eth0",
                    "mac": "00:11:22:33:44:66",
                    "ipv4": ["10.20.30.50"],
                    "ipv6": ["fd00::50"],
                }
            ]
        },
    )
    _complete_success(
        api,
        agent=agent,
        lease=leases_by_kind["diagnostic.command.service_status"],
        telemetry_kind="diagnostic.command.service_status",
        telemetry_payload={
            "command": "systemctl list-units --type=service --state=running --no-pager",
            "sample": "",
            "services": [],
        },
    )

    hosts_response = api.client.get(
        f"/environments/{bundle.environment['id']}/hosts",
        headers=owner.headers,
    )
    assert hosts_response.status_code == 200, hosts_response.text
    host = hosts_response.json()[0]

    custom_template_id = _template_id_for_kind(
        bundle.templates,
        "diagnostic.command.custom",
    )
    policy_response = api.client.post(
        "/compliance/policies",
        json={
            "environment_id": bundle.environment["id"],
            "name": "Require nginx banner",
            "entity_kind": "task_stream",
            "mode": "blacklist",
            "description": "Require custom curl checks to include nginx banner",
            "definition_json": {
                "requirements": [
                    {
                        "label": "curl input",
                        "task_kind": "diagnostic.command.custom",
                        "window_minutes": 60,
                        "input_pattern": "curl .*",
                    },
                    {
                        "label": "nginx banner",
                        "task_kind": "diagnostic.command.custom",
                        "window_minutes": 60,
                        "stdout_pattern": "Welcome to nginx!",
                    },
                ]
            },
        },
        headers=owner.headers,
    )
    assert policy_response.status_code == 201, policy_response.text

    create_task_runs = api.client.post(
        "/task-runs",
        json={
            "environment_id": bundle.environment["id"],
            "host_ids": [host["id"]],
            "task_template_id": custom_template_id,
            "payload_overrides": {"approved_command": "curl https://example.internal"},
        },
        headers=owner.headers,
    )
    assert create_task_runs.status_code == 201, create_task_runs.text

    custom_lease = api.poll_agent(agent=agent)[0]
    _complete_success(
        api,
        agent=agent,
        lease=custom_lease,
        telemetry_kind="diagnostic.command.custom",
        telemetry_payload={
            "approved_command": "curl https://example.internal",
        },
        summary_json={"status": "ok"},
    )

    findings_response = api.client.get(
        f"/environments/{bundle.environment['id']}/compliance/findings",
        headers=owner.headers,
    )
    assert findings_response.status_code == 200, findings_response.text
    findings = findings_response.json()
    assert len(findings) == 1
    assert findings[0]["matched_rule_labels"] == ["nginx banner"]

    create_task_runs = api.client.post(
        "/task-runs",
        json={
            "environment_id": bundle.environment["id"],
            "host_ids": [host["id"]],
            "task_template_id": custom_template_id,
            "payload_overrides": {"approved_command": "curl https://example.internal"},
        },
        headers=owner.headers,
    )
    assert create_task_runs.status_code == 201, create_task_runs.text

    custom_lease = api.poll_agent(agent=agent)[0]
    api.mark_task_running(
        agent=agent,
        task_run_id=custom_lease["id"],
        lease_token=custom_lease["lease_token"],
    )
    api.complete_task(
        agent=agent,
        task_run_id=custom_lease["id"],
        payload={
            "lease_token": custom_lease["lease_token"],
            "status": "succeeded",
            "exit_code": 0,
            "stdout_text": "Welcome to nginx!",
            "stderr_text": "",
            "summary_json": {"status": "ok"},
            "telemetry_kind": "diagnostic.command.custom",
            "telemetry_payload": {
                "approved_command": "curl https://example.internal",
            },
            "failure_reason": None,
        },
    )

    findings_response = api.client.get(
        f"/environments/{bundle.environment['id']}/compliance/findings",
        headers=owner.headers,
    )
    assert findings_response.status_code == 200, findings_response.text
    assert findings_response.json() == []
