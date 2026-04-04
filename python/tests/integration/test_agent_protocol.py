from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from hack_backend.core.models import Agent, AgentStatus
from hack_backend.core.providers import ConfigHack


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


def _set_agent_seen_state(
    *,
    agent_id: str,
    last_seen_at: datetime,
    status: AgentStatus,
) -> None:
    config = ConfigHack()
    engine = create_engine(
        config.postgres.get_sqlalchemy_url("psycopg", is_test_database=True)
    )
    try:
        with Session(engine) as session:
            agent = session.get(Agent, agent_id)
            assert agent is not None
            agent.last_seen_at = last_seen_at
            agent.status = status
            session.commit()
    finally:
        engine.dispose()


def test_mock_agent_drives_bootstrap_and_projection_flow(api) -> None:
    owner = api.register_user(prefix="operator")
    bundle = api.create_project_bundle(
        user=owner,
        project_name="Fleet",
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
    assert {lease["task_template"]["kind"] for lease in bootstrap_leases} == {
        "host.system_profile",
        "host.ip_interfaces",
        "diagnostic.command.service_status",
    }

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
            "cpu_cores": 8,
            "memory_total_mb": 16384,
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

    agents_response = api.client.get(
        "/agents",
        params={"project_id": bundle.project["id"]},
        headers=owner.headers,
    )
    assert agents_response.status_code == 200, agents_response.text
    listed_agents = agents_response.json()
    assert len(listed_agents) == 1
    assert listed_agents[0]["id"] == created_agent["id"]
    assert listed_agents[0]["status"] == "online"
    assert listed_agents[0]["agent_version"] == "pytest-agent/1"

    hosts_response = api.client.get(
        f"/environments/{bundle.environment['id']}/hosts",
        headers=owner.headers,
    )
    assert hosts_response.status_code == 200, hosts_response.text
    hosts = hosts_response.json()
    assert len(hosts) == 1
    host = hosts[0]
    assert host["agent_id"] == created_agent["id"]
    assert host["hostname"] == "alpha.internal"
    assert host["os_name"] == "linux"
    assert host["primary_ipv4"] == "10.20.30.40"
    assert host["primary_ipv6"] == "fd00::40"
    assert host["status"] == "online"

    host_detail = api.client.get(
        f"/hosts/{host['id']}",
        headers=owner.headers,
    )
    assert host_detail.status_code == 200, host_detail.text
    detail_payload = host_detail.json()
    assert detail_payload["name"] == "alpha.internal"
    assert detail_payload["descriptive_fields"]["platform_version"] == "ubuntu-24.04"
    assert detail_payload["descriptive_fields"]["interfaces"][0]["name"] == "eth0"

    telemetry_response = api.client.get(
        f"/hosts/{host['id']}/telemetry",
        headers=owner.headers,
    )
    assert telemetry_response.status_code == 200, telemetry_response.text
    telemetry = telemetry_response.json()
    assert {record["kind"] for record in telemetry} == {
        "host.system_profile",
        "host.ip_interfaces",
    }

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
    created_task_runs = create_task_runs.json()
    assert len(created_task_runs) == 1
    task_run = created_task_runs[0]
    assert task_run["status"] == "queued"
    assert task_run["task_kind"] == "network.endpoint_connectivity"

    connectivity_leases = api.poll_agent(agent=agent)
    assert len(connectivity_leases) == 1
    connectivity_lease = connectivity_leases[0]
    assert connectivity_lease["id"] == task_run["id"]
    assert connectivity_lease["task_template"]["kind"] == "network.endpoint_connectivity"
    assert connectivity_lease["task_template"]["payload_json"]["target_endpoint"] == "alpha.internal"

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

    task_run_response = api.client.get(
        f"/task-runs/{task_run['id']}",
        headers=owner.headers,
    )
    assert task_run_response.status_code == 200, task_run_response.text
    completed_task_run = task_run_response.json()
    assert completed_task_run["status"] == "succeeded"
    assert completed_task_run["attempt_no"] == 1

    result_response = api.client.get(
        f"/task-runs/{task_run['id']}/result",
        headers=owner.headers,
    )
    assert result_response.status_code == 200, result_response.text
    task_result = result_response.json()
    assert task_result["exit_code"] == 0
    assert task_result["summary_json"]["target_endpoint"] == "alpha.internal"

    metrics_response = api.client.get(
        f"/hosts/{host['id']}/metrics",
        headers=owner.headers,
    )
    assert metrics_response.status_code == 200, metrics_response.text
    metrics = metrics_response.json()
    assert len(metrics) == 1
    assert metrics[0]["metric_kind"] == "endpoint_connectivity"
    assert metrics[0]["value_json"]["target_endpoint"] == "alpha.internal"
    assert metrics[0]["value_json"]["success"] is True

    graph_response = api.client.get(
        f"/environments/{bundle.environment['id']}/graph",
        headers=owner.headers,
    )
    assert graph_response.status_code == 200, graph_response.text
    graph = graph_response.json()
    assert len(graph) == 1
    assert graph[0]["relation_kind"] == "endpoint_connectivity"
    assert graph[0]["status"] == "reachable"
    assert graph[0]["source_host_id"] == host["id"]
    assert graph[0]["target_host_id"] == host["id"]
    assert graph[0]["target_label"] == "alpha.internal"


def test_heartbeat_restores_agent_online_status_after_stale_marker(api) -> None:
    owner = api.register_user(prefix="operator")
    bundle = api.create_project_bundle(
        user=owner,
        project_name="Fleet Heartbeat",
    )
    created_agent = api.create_agent(
        user=owner,
        project_id=bundle.project["id"],
        environment_id=bundle.environment["id"],
        name="heartbeat-agent",
    )
    bootstrap_token = api.issue_install_token(
        user=owner,
        agent_id=created_agent["id"],
    )
    agent = api.register_agent(bootstrap_token=bootstrap_token)

    _set_agent_seen_state(
        agent_id=created_agent["id"],
        last_seen_at=datetime.now(UTC) - timedelta(minutes=6),
        status=AgentStatus.OFFLINE,
    )

    agents_response = api.client.get(
        "/agents",
        params={"project_id": bundle.project["id"]},
        headers=owner.headers,
    )
    assert agents_response.status_code == 200, agents_response.text
    assert agents_response.json()[0]["status"] == "offline"

    api.heartbeat_agent(agent=agent)

    agents_response = api.client.get(
        "/agents",
        params={"project_id": bundle.project["id"]},
        headers=owner.headers,
    )
    assert agents_response.status_code == 200, agents_response.text
    refreshed_agent = agents_response.json()[0]
    assert refreshed_agent["status"] == "online"
    assert refreshed_agent["last_seen_at"] is not None


def test_custom_command_tasks_and_safe_install_script(api) -> None:
    owner = api.register_user(prefix="operator")
    bundle = api.create_project_bundle(
        user=owner,
        project_name="Fleet Custom",
    )
    custom_template_id = _template_id_for_kind(
        bundle.templates,
        "diagnostic.command.custom",
    )
    created_agent = api.create_agent(
        user=owner,
        project_id=bundle.project["id"],
        environment_id=bundle.environment["id"],
        name="custom-agent",
        safe_install=True,
    )
    install_script = api.get_install_script(
        user=owner,
        agent_id=created_agent["id"],
    )
    assert install_script["safe_install"] is True

    script_response = api.client.get(install_script["script_url"])
    assert script_response.status_code == 200, script_response.text
    assert "HACK_AGENT_SAFE_MODE=1" in script_response.text

    bootstrap_token = install_script["script_url"].rstrip("/").split("/")[-1].split("?")[0]
    agent = api.register_agent(bootstrap_token=bootstrap_token)

    hosts_response = api.client.get(
        f"/environments/{bundle.environment['id']}/hosts",
        headers=owner.headers,
    )
    assert hosts_response.status_code == 200, hosts_response.text
    host_id = hosts_response.json()[0]["id"]

    create_task_runs = api.client.post(
        "/task-runs",
        json={
            "environment_id": bundle.environment["id"],
            "host_ids": [host_id],
            "task_template_id": custom_template_id,
            "payload_overrides": {"approved_command": "echo custom-task"},
        },
        headers=owner.headers,
    )
    assert create_task_runs.status_code == 201, create_task_runs.text

    custom_leases = api.poll_agent(agent=agent)
    custom_lease = next(
        lease
        for lease in custom_leases
        if lease["task_template"]["kind"] == "diagnostic.command.custom"
    )
    assert custom_lease["task_template"]["payload_json"]["approved_command"] == "echo custom-task"
