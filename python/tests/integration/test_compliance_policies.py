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


def test_compliance_materializes_service_and_endpoint_policies(api) -> None:
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
            "command": "systemctl list-units --type=service --all --no-pager",
            "sample": "sample",
            "services": [
                {
                    "name": "sshd.service",
                    "status": "running",
                    "active_state": "active",
                    "sub_state": "running",
                },
                {
                    "name": "cron.service",
                    "status": "running",
                    "active_state": "active",
                    "sub_state": "running",
                },
            ],
        },
    )

    hosts_response = api.client.get(
        f"/environments/{bundle.environment['id']}/hosts",
        headers=owner.headers,
    )
    assert hosts_response.status_code == 200, hosts_response.text
    host = hosts_response.json()[0]

    service_policy = api.client.post(
        "/compliance/policies",
        json={
            "environment_id": bundle.environment["id"],
            "name": "Block SSH service",
            "entity_kind": "service_status",
            "mode": "blacklist",
            "description": "sshd must not run in this environment",
            "definition_json": {
                "rules": [
                    {
                        "label": "SSH daemon",
                        "host_ids": [host["id"]],
                        "service_name": "sshd.service",
                        "status": "running",
                    }
                ]
            },
        },
        headers=owner.headers,
    )
    assert service_policy.status_code == 201, service_policy.text
    assert service_policy.json()["revision_no"] == 1

    findings_response = api.client.get(
        f"/environments/{bundle.environment['id']}/compliance/findings",
        headers=owner.headers,
    )
    assert findings_response.status_code == 200, findings_response.text
    findings = findings_response.json()
    assert len(findings) == 1
    assert findings[0]["policy_name"] == "Block SSH service"
    assert findings[0]["subject_label"].endswith("sshd.service")
    assert findings[0]["matched_rule_labels"] == ["SSH daemon"]

    events_response = api.client.get(
        f"/environments/{bundle.environment['id']}/compliance/events",
        headers=owner.headers,
    )
    assert events_response.status_code == 200, events_response.text
    events = events_response.json()
    assert len(events) == 1
    assert events[0]["event_kind"] == "rise"
    assert events[0]["event_origin"] == "backfill"
    assert events[0]["policy_name"] == "Block SSH service"

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

    endpoint_policy = api.client.post(
        "/compliance/policies",
        json={
            "environment_id": bundle.environment["id"],
            "name": "Allow alpha self-check only",
            "entity_kind": "endpoint_connectivity",
            "mode": "allowlist",
            "definition_json": {
                "rules": [
                    {
                        "label": "alpha -> alpha",
                        "source_host_ids": [host["id"]],
                        "target_endpoint": "alpha.internal",
                        "connectivity": "reachable",
                    }
                ]
            },
        },
        headers=owner.headers,
    )
    assert endpoint_policy.status_code == 201, endpoint_policy.text
    policy_payload = endpoint_policy.json()
    assert policy_payload["revision_no"] == 1

    findings_response = api.client.get(
        f"/environments/{bundle.environment['id']}/compliance/findings",
        headers=owner.headers,
    )
    findings = findings_response.json()
    assert len(findings) == 1
    assert findings[0]["policy_name"] == "Block SSH service"

    patch_policy = api.client.patch(
        f"/compliance/policies/{policy_payload['id']}",
        json={
            "definition_json": {
                "rules": [
                    {
                        "label": "allow different endpoint",
                        "source_host_ids": [host["id"]],
                        "target_endpoint": "db.internal",
                        "connectivity": "reachable",
                    }
                ]
            }
        },
        headers=owner.headers,
    )
    assert patch_policy.status_code == 200, patch_policy.text
    assert patch_policy.json()["revision_no"] == 2

    findings_response = api.client.get(
        f"/environments/{bundle.environment['id']}/compliance/findings",
        headers=owner.headers,
    )
    findings = findings_response.json()
    assert len(findings) == 2
    endpoint_violation = next(
        finding
        for finding in findings
        if finding["policy_name"] == "Allow alpha self-check only"
    )
    assert endpoint_violation["matched_rule_labels"] == []
    assert endpoint_violation["subject_label"] == "alpha.internal -> alpha.internal"
    assert endpoint_violation["revision_no"] == 2


def test_compliance_rejects_second_ruleset_for_same_entity_kind(api) -> None:
    owner = api.register_user(prefix="compliance-single-kind")
    bundle = api.create_project_bundle(
        user=owner,
        project_name="Single Ruleset Compliance",
    )

    first_response = api.client.post(
        "/compliance/policies",
        json={
            "environment_id": bundle.environment["id"],
            "name": "Service status rules",
            "entity_kind": "service_status",
            "mode": "blacklist",
            "definition_json": {
                "rules": [
                    {
                        "label": "block sshd",
                        "host_ids": [],
                        "service_name": "sshd.service",
                        "status": "running",
                    }
                ]
            },
        },
        headers=owner.headers,
    )
    assert first_response.status_code == 201, first_response.text

    second_response = api.client.post(
        "/compliance/policies",
        json={
            "environment_id": bundle.environment["id"],
            "name": "Another service status rules",
            "entity_kind": "service_status",
            "mode": "allowlist",
            "definition_json": {
                "rules": [
                    {
                        "label": "allow nginx",
                        "host_ids": [],
                        "service_name": "nginx.service",
                        "status": "running",
                    }
                ]
            },
        },
        headers=owner.headers,
    )
    assert second_response.status_code == 409, second_response.text
    assert "Only one compliance rule set is allowed per entity type" in second_response.text
