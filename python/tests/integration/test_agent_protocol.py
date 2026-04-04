from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from hack_backend.core.models import (
    Agent,
    AgentStatus,
    InviteStatus,
    ProjectMember,
    ProjectMemberRole,
)
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


def _grant_project_membership(
    *,
    project_id: str,
    user_id: int,
    role: ProjectMemberRole = ProjectMemberRole.MEMBER,
) -> None:
    config = ConfigHack()
    engine = create_engine(
        config.postgres.get_sqlalchemy_url("psycopg", is_test_database=True)
    )
    try:
        with Session(engine) as session:
            membership = session.get(
                ProjectMember,
                {"project_id": project_id, "user_id": user_id},
            )
            if membership is None:
                membership = ProjectMember(
                    project_id=project_id,
                    user_id=user_id,
                    role=role,
                    invite_status=InviteStatus.ACCEPTED,
                )
                session.add(membership)
            else:
                membership.role = role
                membership.invite_status = InviteStatus.ACCEPTED
            session.commit()
    finally:
        engine.dispose()


def _provision_host_with_connectivity_activity(
    api,
    *,
    project_name: str,
    agent_name: str,
) -> dict[str, Any]:
    owner = api.register_user(prefix="operator")
    bundle = api.create_project_bundle(
        user=owner,
        project_name=project_name,
    )
    created_agent = api.create_agent(
        user=owner,
        project_id=bundle.project["id"],
        environment_id=bundle.environment["id"],
        name=agent_name,
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
            "hostname": f"{agent_name}.internal",
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

    hosts_response = api.client.get(
        f"/environments/{bundle.environment['id']}/hosts",
        headers=owner.headers,
    )
    assert hosts_response.status_code == 200, hosts_response.text
    hosts = hosts_response.json()
    assert len(hosts) == 1
    host = hosts[0]

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
            "payload_overrides": {"target_endpoint": f"{agent_name}.internal"},
        },
        headers=owner.headers,
    )
    assert create_task_runs.status_code == 201, create_task_runs.text
    task_run = create_task_runs.json()[0]

    connectivity_lease = api.poll_agent(agent=agent)[0]
    _complete_success(
        api,
        agent=agent,
        lease=connectivity_lease,
        telemetry_kind="network.endpoint_connectivity",
        telemetry_payload={
            "target_endpoint": f"{agent_name}.internal",
            "success": True,
            "latency_ms": 12.5,
        },
        summary_json={"target_endpoint": f"{agent_name}.internal"},
    )

    return {
        "owner": owner,
        "bundle": bundle,
        "created_agent": created_agent,
        "registered_agent": agent,
        "host": host,
        "task_run": task_run,
    }


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
    assert listed_agents[0]["agent_version"] == "0.1.0"
    assert listed_agents[0]["reported_agent_version"] == "0.1.0"

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


def test_delete_host_cascades_related_entities(api) -> None:
    scenario = _provision_host_with_connectivity_activity(
        api,
        project_name="Fleet Host Delete",
        agent_name="delete-host-agent",
    )
    owner = scenario["owner"]
    bundle = scenario["bundle"]
    created_agent = scenario["created_agent"]
    host = scenario["host"]
    task_run = scenario["task_run"]

    delete_response = api.client.delete(
        f"/hosts/{host['id']}",
        headers=owner.headers,
    )
    assert delete_response.status_code == 204, delete_response.text

    host_detail = api.client.get(
        f"/hosts/{host['id']}",
        headers=owner.headers,
    )
    assert host_detail.status_code == 404

    task_run_response = api.client.get(
        f"/task-runs/{task_run['id']}",
        headers=owner.headers,
    )
    assert task_run_response.status_code == 404

    hosts_response = api.client.get(
        f"/environments/{bundle.environment['id']}/hosts",
        headers=owner.headers,
    )
    assert hosts_response.status_code == 200, hosts_response.text
    assert hosts_response.json() == []

    graph_response = api.client.get(
        f"/environments/{bundle.environment['id']}/graph",
        headers=owner.headers,
    )
    assert graph_response.status_code == 200, graph_response.text
    assert graph_response.json() == []

    task_runs_response = api.client.get(
        f"/environments/{bundle.environment['id']}/task-runs",
        headers=owner.headers,
    )
    assert task_runs_response.status_code == 200, task_runs_response.text
    assert task_runs_response.json() == []

    agents_response = api.client.get(
        "/agents",
        params={"project_id": bundle.project["id"]},
        headers=owner.headers,
    )
    assert agents_response.status_code == 200, agents_response.text
    agents = agents_response.json()
    assert len(agents) == 1
    assert agents[0]["id"] == created_agent["id"]
    assert agents[0]["environments"] == []


def test_delete_agent_cascades_related_entities(api) -> None:
    scenario = _provision_host_with_connectivity_activity(
        api,
        project_name="Fleet Agent Delete",
        agent_name="delete-agent",
    )
    owner = scenario["owner"]
    bundle = scenario["bundle"]
    created_agent = scenario["created_agent"]
    host = scenario["host"]
    task_run = scenario["task_run"]

    delete_response = api.client.delete(
        f"/agents/{created_agent['id']}",
        headers=owner.headers,
    )
    assert delete_response.status_code == 204, delete_response.text

    agents_response = api.client.get(
        "/agents",
        params={"project_id": bundle.project["id"]},
        headers=owner.headers,
    )
    assert agents_response.status_code == 200, agents_response.text
    assert agents_response.json() == []

    host_detail = api.client.get(
        f"/hosts/{host['id']}",
        headers=owner.headers,
    )
    assert host_detail.status_code == 404

    task_run_response = api.client.get(
        f"/task-runs/{task_run['id']}",
        headers=owner.headers,
    )
    assert task_run_response.status_code == 404

    hosts_response = api.client.get(
        f"/environments/{bundle.environment['id']}/hosts",
        headers=owner.headers,
    )
    assert hosts_response.status_code == 200, hosts_response.text
    assert hosts_response.json() == []

    graph_response = api.client.get(
        f"/environments/{bundle.environment['id']}/graph",
        headers=owner.headers,
    )
    assert graph_response.status_code == 200, graph_response.text
    assert graph_response.json() == []


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
    assert install_script["version"] == "0.1.0"

    script_response = api.client.get(install_script["script_url"])
    assert script_response.status_code == 200, script_response.text
    assert "HACK_AGENT_SAFE_MODE=1" in script_response.text
    assert "AGENT_VERSION='0.1.0'" in script_response.text
    assert "HACK_AGENT_VERSION=$AGENT_VERSION" in script_response.text
    assert "/agent-artifacts/0.1.0/linux" in script_response.text
    assert "version.txt" in script_response.text

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


def test_self_update_tracks_from_and_to_versions(api) -> None:
    owner = api.register_user(prefix="operator")
    bundle = api.create_project_bundle(
        user=owner,
        project_name="Fleet Update",
    )
    self_update_template_id = _template_id_for_kind(
        bundle.templates,
        "agent.self_update",
    )
    created_agent = api.create_agent(
        user=owner,
        project_id=bundle.project["id"],
        environment_id=bundle.environment["id"],
        name="update-agent",
        agent_version="0.1.0",
    )
    bootstrap_token = api.issue_install_token(
        user=owner,
        agent_id=created_agent["id"],
    )
    agent = api.register_agent(
        bootstrap_token=bootstrap_token,
        agent_version="0.1.0",
    )
    for lease in api.poll_agent(agent=agent):
        kind = lease["task_template"]["kind"]
        telemetry_payload = (
            {
                "hostname": "update-agent.internal",
                "os_name": "linux",
                "platform_version": "ubuntu-24.04",
                "kernel": "6.8.0",
                "cpu_model": "Xeon Platinum",
                "cpu_cores": 8,
                "memory_total_mb": 16384,
            }
            if kind == "host.system_profile"
            else {
                "interfaces": [
                    {
                        "name": "eth0",
                        "mac": "00:11:22:33:44:55",
                        "ipv4": ["10.20.30.40"],
                        "ipv6": ["fd00::40"],
                    }
                ]
            }
            if kind == "host.ip_interfaces"
            else {"services": []}
        )
        _complete_success(
            api,
            agent=agent,
            lease=lease,
            telemetry_kind=kind,
            telemetry_payload=telemetry_payload,
        )

    hosts_response = api.client.get(
        f"/environments/{bundle.environment['id']}/hosts",
        headers=owner.headers,
    )
    assert hosts_response.status_code == 200, hosts_response.text
    host_id = hosts_response.json()[0]["id"]

    same_version_task_runs = api.client.post(
        "/task-runs",
        json={
            "environment_id": bundle.environment["id"],
            "host_ids": [host_id],
            "task_template_id": self_update_template_id,
        },
        headers=owner.headers,
    )
    assert same_version_task_runs.status_code == 201, same_version_task_runs.text
    same_version_task = same_version_task_runs.json()[0]
    assert same_version_task["command"] == "self-update 0.1.0 -> 0.1.0"

    update_agent_response = api.client.put(
        f"/agents/{created_agent['id']}",
        json={"agent_version": "0.1.1"},
        headers=owner.headers,
    )
    assert update_agent_response.status_code == 200, update_agent_response.text
    assert update_agent_response.json()["agent_version"] == "0.1.1"

    mismatched_install = api.client.get(
        f"/agents/{created_agent['id']}/install-script",
        headers=owner.headers,
    )
    assert mismatched_install.status_code == 409, mismatched_install.text

    next_update_task_runs = api.client.post(
        "/task-runs",
        json={
            "environment_id": bundle.environment["id"],
            "host_ids": [host_id],
            "task_template_id": self_update_template_id,
            "payload_overrides": {
                "artifact_url": "https://updates.example.com/hack-agent",
            },
        },
        headers=owner.headers,
    )
    assert next_update_task_runs.status_code == 201, next_update_task_runs.text
    next_update_task = next_update_task_runs.json()[0]
    assert next_update_task["command"] == "self-update 0.1.0 -> 0.1.1"

    same_version_lease = next(
        lease
        for lease in api.poll_agent(agent=agent)
        if lease["id"] == same_version_task["id"]
    )
    api.mark_task_running(
        agent=agent,
        task_run_id=same_version_lease["id"],
        lease_token=same_version_lease["lease_token"],
    )
    api.complete_task(
        agent=agent,
        task_run_id=same_version_lease["id"],
        payload={
            "lease_token": same_version_lease["lease_token"],
            "status": "succeeded",
            "exit_code": 0,
            "stdout_text": "",
            "stderr_text": "",
            "summary_json": {
                "action": "self_update",
                "from_version": "0.1.0",
                "to_version": "0.1.0",
                "version": "0.1.0",
            },
            "telemetry_kind": None,
            "telemetry_payload": None,
            "failure_reason": None,
        },
    )

    update_lease = next(
        lease
        for lease in api.poll_agent(agent=agent)
        if lease["id"] == next_update_task["id"]
    )
    assert update_lease["task_template"]["payload_json"]["from_version"] == "0.1.0"
    assert update_lease["task_template"]["payload_json"]["version"] == "0.1.1"

    api.mark_task_running(
        agent=agent,
        task_run_id=update_lease["id"],
        lease_token=update_lease["lease_token"],
    )
    api.complete_task(
        agent=agent,
        task_run_id=update_lease["id"],
        payload={
            "lease_token": update_lease["lease_token"],
            "status": "succeeded",
            "exit_code": 0,
            "stdout_text": "",
            "stderr_text": "",
            "summary_json": {
                "action": "self_update",
                "from_version": "0.1.0",
                "to_version": "0.1.1",
                "version": "0.1.1",
            },
            "telemetry_kind": None,
            "telemetry_payload": None,
            "failure_reason": None,
        },
    )

    api.heartbeat_agent(agent=agent, agent_version="0.1.1")

    agents_response = api.client.get(
        "/agents",
        params={"project_id": bundle.project["id"]},
        headers=owner.headers,
    )
    assert agents_response.status_code == 200, agents_response.text
    refreshed_agent = agents_response.json()[0]
    assert refreshed_agent["agent_version"] == "0.1.1"
    assert refreshed_agent["reported_agent_version"] == "0.1.1"


def test_agent_poll_respects_max_concurrent_tasks(api) -> None:
    owner = api.register_user(prefix="owner")
    bundle = api.create_project_bundle(
        user=owner,
        project_name="Concurrency",
    )
    created_agent = api.create_agent(
        user=owner,
        project_id=bundle.project["id"],
        environment_id=bundle.environment["id"],
        name="parallel-agent",
        max_concurrent_tasks=2,
    )
    assert created_agent["max_concurrent_tasks"] == 2

    bootstrap_token = api.issue_install_token(
        user=owner,
        agent_id=created_agent["id"],
    )
    agent = api.register_agent(bootstrap_token=bootstrap_token)

    for lease in api.poll_agent(agent=agent):
        kind = lease["task_template"]["kind"]
        telemetry_kind = kind
        telemetry_payload = (
            {
                "hostname": "parallel.internal",
                "os_name": "linux",
                "platform_version": "ubuntu-24.04",
                "kernel": "6.8.0",
                "cpu_model": "Xeon Platinum",
                "cpu_cores": 8,
                "memory_total_mb": 16384,
            }
            if kind == "host.system_profile"
            else {
                "interfaces": [
                    {
                        "name": "eth0",
                        "mac": "00:11:22:33:44:55",
                        "ipv4": ["10.20.30.40"],
                        "ipv6": ["fd00::40"],
                    }
                ]
            }
            if kind == "host.ip_interfaces"
            else {"services": []}
        )
        _complete_success(
            api,
            agent=agent,
            lease=lease,
            telemetry_kind=telemetry_kind,
            telemetry_payload=telemetry_payload,
        )

    hosts_response = api.client.get(
        f"/environments/{bundle.environment['id']}/hosts",
        headers=owner.headers,
    )
    assert hosts_response.status_code == 200, hosts_response.text
    host_id = hosts_response.json()[0]["id"]

    connectivity_template_id = _template_id_for_kind(
        bundle.templates,
        "network.endpoint_connectivity",
    )
    create_task_runs = api.client.post(
        "/task-runs",
        json={
            "environment_id": bundle.environment["id"],
            "host_ids": [host_id],
            "task_template_id": connectivity_template_id,
            "payload_overrides": {"target_endpoint": "parallel.internal"},
        },
        headers=owner.headers,
    )
    assert create_task_runs.status_code == 201, create_task_runs.text

    for _ in range(3):
        create_more_task_runs = api.client.post(
            "/task-runs",
            json={
                "environment_id": bundle.environment["id"],
                "host_ids": [host_id],
                "task_template_id": connectivity_template_id,
                "payload_overrides": {"target_endpoint": "parallel.internal"},
            },
            headers=owner.headers,
        )
        assert create_more_task_runs.status_code == 201, create_more_task_runs.text

    first_batch = api.poll_agent(agent=agent, limit=10)
    assert len(first_batch) == 2

    for lease in first_batch:
        api.mark_task_running(
            agent=agent,
            task_run_id=lease["id"],
            lease_token=lease["lease_token"],
        )

    assert api.poll_agent(agent=agent, limit=10) == []

    _complete_success(
        api,
        agent=agent,
        lease=first_batch[0],
        telemetry_kind="network.endpoint_connectivity",
        telemetry_payload={
            "target_endpoint": "parallel.internal",
            "success": True,
            "latency_ms": 12.5,
        },
        summary_json={"target_endpoint": "parallel.internal"},
    )

    next_batch = api.poll_agent(agent=agent, limit=10)
    assert len(next_batch) == 1


def test_non_admin_cannot_update_agent_concurrency_limit(api) -> None:
    owner = api.register_user(prefix="owner")
    member = api.register_user(prefix="member")
    bundle = api.create_project_bundle(
        user=owner,
        project_name="Permissions",
    )
    _grant_project_membership(
        project_id=bundle.project["id"],
        user_id=int(member.id),
    )

    created_agent = api.create_agent(
        user=owner,
        project_id=bundle.project["id"],
        environment_id=bundle.environment["id"],
        name="guarded-agent",
    )

    update_response = api.client.put(
        f"/agents/{created_agent['id']}",
        json={"max_concurrent_tasks": 8},
        headers=member.headers,
    )
    assert update_response.status_code == 403, update_response.text
    assert update_response.json()["detail"] == "Project admin access required"
