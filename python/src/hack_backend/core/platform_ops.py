from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from hack_backend.core.models import (
    Agent,
    AgentBootstrapToken,
    AgentStatus,
    Environment,
    EnvironmentMember,
    EnvironmentMemberRole,
    GraphEdge,
    Host,
    InviteStatus,
    MetricSnapshot,
    Project,
    ProjectMember,
    ProjectMemberRole,
    ScheduleRule,
    TaskRun,
    TaskRunResult,
    TaskRunStatus,
    TaskTemplate,
    TelemetryRecord,
)
from hack_backend.core.security import hash_secret, new_secret

BOOTSTRAP_TEMPLATE_KINDS = {
    "host.system_profile",
    "host.ip_interfaces",
}

BUILTIN_TEMPLATES: tuple[dict[str, Any], ...] = (
    {
        "kind": "host.system_profile",
        "name": "System Profile",
        "payload_json": {"template_code": "system_info"},
        "metric_policy_json": {"projection": "host_metadata"},
        "approved_command": None,
    },
    {
        "kind": "host.ip_interfaces",
        "name": "IP Interfaces",
        "payload_json": {"template_code": "network_interfaces"},
        "metric_policy_json": {"projection": "host_metadata"},
        "approved_command": None,
    },
    {
        "kind": "network.endpoint_connectivity",
        "name": "Endpoint Connectivity",
        "payload_json": {"template_code": "ping", "default_port": 443},
        "metric_policy_json": {"metric_kind": "endpoint_connectivity"},
        "approved_command": None,
    },
    {
        "kind": "diagnostic.command.port_scan",
        "name": "Port Scan",
        "payload_json": {"template_code": "port_scan"},
        "metric_policy_json": {},
        "approved_command": "ss -tulpn",
    },
    {
        "kind": "diagnostic.command.disk_usage",
        "name": "Disk Usage",
        "payload_json": {"template_code": "disk_usage"},
        "metric_policy_json": {"metric_kind": "host.disk_usage"},
        "approved_command": "df -h",
    },
    {
        "kind": "diagnostic.command.memory_cpu",
        "name": "Memory and CPU",
        "payload_json": {"template_code": "memory_cpu"},
        "metric_policy_json": {"metric_kind": "host.resource_usage"},
        "approved_command": "uptime && free -m",
    },
    {
        "kind": "diagnostic.command.service_status",
        "name": "Service Status",
        "payload_json": {"template_code": "service_status"},
        "metric_policy_json": {},
        "approved_command": "systemctl list-units --type=service --state=running --no-pager",
    },
    {
        "kind": "diagnostic.command.system_logs",
        "name": "System Logs",
        "payload_json": {"template_code": "system_logs"},
        "metric_policy_json": {},
        "approved_command": "journalctl -n 100 --no-pager",
    },
)


def utcnow() -> datetime:
    return datetime.now(tz=UTC)


def ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def merged_payload(task_template: TaskTemplate, task_run: TaskRun) -> dict[str, Any]:
    payload = dict(task_template.payload_json or {})
    payload.update(task_run.payload_override_json or {})
    if task_template.approved_command:
        payload.setdefault("approved_command", task_template.approved_command)
    return payload


async def delete_hosts_and_related(
    session: AsyncSession,
    *,
    host_ids: list[str],
) -> None:
    if not host_ids:
        return

    await session.execute(
        GraphEdge.__table__.delete().where(GraphEdge.source_host_id.in_(host_ids))
    )
    await session.execute(
        GraphEdge.__table__.delete().where(GraphEdge.target_host_id.in_(host_ids))
    )
    await session.execute(
        MetricSnapshot.__table__.delete().where(MetricSnapshot.host_id.in_(host_ids))
    )
    await session.execute(
        TelemetryRecord.__table__.delete().where(
            TelemetryRecord.host_id.in_(host_ids)
        )
    )

    task_run_ids = [
        row[0]
        for row in (
            await session.execute(
                select(TaskRun.id).where(TaskRun.host_id.in_(host_ids))
            )
        ).all()
    ]
    if task_run_ids:
        await session.execute(
            TaskRunResult.__table__.delete().where(
                TaskRunResult.task_run_id.in_(task_run_ids)
            )
        )
        await session.execute(
            TaskRun.__table__.delete().where(TaskRun.id.in_(task_run_ids))
        )

    await session.execute(Host.__table__.delete().where(Host.id.in_(host_ids)))


async def ensure_project_templates(
    session: AsyncSession,
    project_id: str,
) -> list[TaskTemplate]:
    existing = await session.scalars(
        select(TaskTemplate).where(TaskTemplate.project_id == project_id)
    )
    templates = list(existing)
    if templates:
        return templates

    created: list[TaskTemplate] = []
    for template_data in BUILTIN_TEMPLATES:
        template = TaskTemplate(
            project_id=project_id,
            kind=template_data["kind"],
            name=template_data["name"],
            schema_version=1,
            payload_json=template_data["payload_json"],
            metric_policy_json=template_data["metric_policy_json"],
            approved_command=template_data["approved_command"],
        )
        session.add(template)
        created.append(template)

    await session.flush()
    return created


async def create_project_defaults(
    session: AsyncSession,
    *,
    owner_id: int,
    project_name: str,
) -> Project:
    project = Project(
        name=project_name,
        owner_id=owner_id,
    )
    session.add(project)
    await session.flush()

    session.add(
        ProjectMember(
            project_id=project.id,
            user_id=owner_id,
            role=ProjectMemberRole.ADMIN,
            invite_status=InviteStatus.ACCEPTED,
        )
    )

    environment = Environment(
        project_id=project.id,
        name="main",
    )
    session.add(environment)
    await session.flush()
    session.add(
        EnvironmentMember(
            environment_id=environment.id,
            user_id=owner_id,
            role=EnvironmentMemberRole.OPERATOR,
        )
    )

    await ensure_project_templates(session, project.id)
    return project


async def issue_bootstrap_token(
    session: AsyncSession,
    *,
    agent_id: str,
) -> tuple[AgentBootstrapToken, str]:
    raw_token = new_secret(24)
    bootstrap_token = AgentBootstrapToken(
        agent_id=agent_id,
        token_hash=hash_secret(raw_token),
    )
    session.add(bootstrap_token)
    await session.flush()
    return bootstrap_token, raw_token


async def create_hosts_for_agent(
    session: AsyncSession,
    *,
    agent: Agent,
    environment_ids: list[str],
) -> list[Host]:
    existing_hosts = await session.scalars(
        select(Host).where(Host.agent_id == agent.id)
    )
    existing_by_env = {host.environment_id: host for host in existing_hosts}

    hosts: list[Host] = []
    for environment_id in environment_ids:
        host = existing_by_env.get(environment_id)
        if host is None:
            host = Host(
                environment_id=environment_id,
                agent_id=agent.id,
                name=agent.name,
                internal_identifier=f"{environment_id}:{agent.id}",
                descriptive_fields_json={"agent_name": agent.name},
            )
            session.add(host)
            hosts.append(host)
        else:
            host.name = agent.name
            host.descriptive_fields_json = {
                **(host.descriptive_fields_json or {}),
                "agent_name": agent.name,
            }
            hosts.append(host)

    await session.flush()
    return hosts


async def sync_hosts_for_agent(
    session: AsyncSession,
    *,
    agent: Agent,
    environment_ids: list[str],
) -> list[Host]:
    target_env_ids = list(dict.fromkeys(environment_ids))
    existing_hosts = list(
        await session.scalars(select(Host).where(Host.agent_id == agent.id))
    )
    existing_by_env = {host.environment_id: host for host in existing_hosts}
    target_env_id_set = set(target_env_ids)

    removed_host_ids = [
        host.id
        for host in existing_hosts
        if host.environment_id not in target_env_id_set
    ]
    await delete_hosts_and_related(session, host_ids=removed_host_ids)

    hosts: list[Host] = []
    for environment_id in target_env_ids:
        host = existing_by_env.get(environment_id)
        if host is None:
            host = Host(
                environment_id=environment_id,
                agent_id=agent.id,
                name=agent.name,
                internal_identifier=f"{environment_id}:{agent.id}",
                descriptive_fields_json={"agent_name": agent.name},
            )
            session.add(host)
        else:
            host.name = agent.name
            host.descriptive_fields_json = {
                **(host.descriptive_fields_json or {}),
                "agent_name": agent.name,
            }
        hosts.append(host)

    await session.flush()
    return hosts


async def queue_bootstrap_tasks_for_host(
    session: AsyncSession,
    *,
    host: Host,
) -> None:
    templates = await session.scalars(
        select(TaskTemplate).where(
            TaskTemplate.project_id
            == select(Environment.project_id)
            .where(Environment.id == host.environment_id)
            .scalar_subquery(),
            TaskTemplate.kind.in_(BOOTSTRAP_TEMPLATE_KINDS),
        )
    )
    template_list = list(templates)
    if not template_list:
        return

    existing_template_ids = {
        row[0]
        for row in (
            await session.execute(
                select(TaskRun.task_template_id).where(
                    TaskRun.host_id == host.id,
                    TaskRun.task_template_id.in_(
                        [template.id for template in template_list]
                    ),
                )
            )
        ).all()
    }

    for template in template_list:
        if template.id in existing_template_ids:
            continue
        session.add(
            TaskRun(
                environment_id=host.environment_id,
                host_id=host.id,
                agent_id=host.agent_id,
                task_template_id=template.id,
                status=TaskRunStatus.QUEUED,
            )
        )

    await session.flush()


def _payload_hash(payload: dict[str, Any]) -> str:
    blob = json.dumps(payload, sort_keys=True, ensure_ascii=True).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()


async def store_task_result(
    session: AsyncSession,
    *,
    task_run: TaskRun,
    exit_code: int | None,
    stdout_text: str | None,
    stderr_text: str | None,
    summary_json: dict[str, Any] | None,
    telemetry_payload: dict[str, Any] | None,
    telemetry_kind: str | None,
    telemetry_schema_version: int = 1,
    status: TaskRunStatus,
    failure_reason: str | None,
) -> None:
    task_run.status = status
    task_run.failure_reason = failure_reason
    task_run.finished_at = utcnow()
    task_run.lease_token = None
    task_run.leased_until = None

    existing_result = await session.get(TaskRunResult, task_run.id)
    if existing_result is None:
        session.add(
            TaskRunResult(
                task_run_id=task_run.id,
                exit_code=exit_code,
                stdout_text=stdout_text,
                stderr_text=stderr_text,
                summary_json=summary_json,
            )
        )
    else:
        existing_result.exit_code = exit_code
        existing_result.stdout_text = stdout_text
        existing_result.stderr_text = stderr_text
        existing_result.summary_json = summary_json

    telemetry_record: TelemetryRecord | None = None
    if telemetry_payload is not None and telemetry_kind is not None:
        payload_hash = _payload_hash(telemetry_payload)
        telemetry_record = TelemetryRecord(
            task_run_id=task_run.id,
            environment_id=task_run.environment_id,
            host_id=task_run.host_id,
            kind=telemetry_kind,
            schema_version=telemetry_schema_version,
            collected_at=utcnow(),
            payload_json=telemetry_payload,
            payload_hash=payload_hash,
            size_bytes=len(json.dumps(telemetry_payload)),
        )
        session.add(telemetry_record)
        await session.flush()

        await update_host_projection(
            session,
            host_id=task_run.host_id,
            telemetry_kind=telemetry_kind,
            payload=telemetry_payload,
            collected_at=telemetry_record.collected_at,
        )
        await materialize_metric_projection(
            session,
            task_run=task_run,
            telemetry_record=telemetry_record,
        )
        await materialize_graph_projection(
            session,
            task_run=task_run,
            telemetry_record=telemetry_record,
        )


async def update_host_projection(
    session: AsyncSession,
    *,
    host_id: str,
    telemetry_kind: str,
    payload: dict[str, Any],
    collected_at: datetime,
) -> None:
    host = await session.get(Host, host_id)
    if host is None:
        return

    host.metadata_last_refreshed_at = collected_at

    if telemetry_kind == "host.system_profile":
        host.os_name = payload.get("os_name") or host.os_name
        host.hostname = payload.get("hostname") or host.hostname
        host.name = payload.get("hostname") or host.name
        host.descriptive_fields_json = {
            **(host.descriptive_fields_json or {}),
            "platform_version": payload.get("platform_version"),
            "kernel": payload.get("kernel"),
            "cpu_model": payload.get("cpu_model"),
        }
    elif telemetry_kind == "host.ip_interfaces":
        interfaces = payload.get("interfaces") or []
        primary_ipv4 = None
        primary_ipv6 = None
        for interface in interfaces:
            ipv4 = interface.get("ipv4") or []
            ipv6 = interface.get("ipv6") or []
            if primary_ipv4 is None and ipv4:
                primary_ipv4 = ipv4[0]
            if primary_ipv6 is None and ipv6:
                primary_ipv6 = ipv6[0]
        host.primary_ipv4 = primary_ipv4 or host.primary_ipv4
        host.primary_ipv6 = primary_ipv6 or host.primary_ipv6
        host.descriptive_fields_json = {
            **(host.descriptive_fields_json or {}),
            "interfaces": interfaces,
        }


async def materialize_metric_projection(
    session: AsyncSession,
    *,
    task_run: TaskRun,
    telemetry_record: TelemetryRecord,
) -> None:
    payload = telemetry_record.payload_json
    metric_kind: str | None = None
    value_json: dict[str, Any] | None = None

    if telemetry_record.kind == "network.endpoint_connectivity":
        metric_kind = "endpoint_connectivity"
        value_json = {
            "target_endpoint": payload.get("target_endpoint"),
            "success": payload.get("success"),
            "latency_ms": payload.get("latency_ms"),
        }
    elif telemetry_record.kind == "diagnostic.command.disk_usage":
        metric_kind = "host.disk_usage"
        value_json = {
            "sample": payload.get("sample"),
            "captured": True,
        }
    elif telemetry_record.kind == "diagnostic.command.memory_cpu":
        metric_kind = "host.resource_usage"
        value_json = {
            "sample": payload.get("sample"),
            "captured": True,
        }

    if metric_kind is None or value_json is None:
        return

    session.add(
        MetricSnapshot(
            environment_id=task_run.environment_id,
            host_id=task_run.host_id,
            metric_kind=metric_kind,
            computed_at=telemetry_record.collected_at,
            value_json=value_json,
        )
    )


async def materialize_graph_projection(
    session: AsyncSession,
    *,
    task_run: TaskRun,
    telemetry_record: TelemetryRecord,
) -> None:
    if telemetry_record.kind != "network.endpoint_connectivity":
        return

    payload = telemetry_record.payload_json
    target_endpoint = payload.get("target_endpoint")
    target_host_id = payload.get("target_host_id")
    if target_host_id is None and target_endpoint:
        target_host = await find_host_for_endpoint(
            session,
            environment_id=task_run.environment_id,
            endpoint=target_endpoint,
        )
        target_host_id = target_host.id if target_host else None

    expires_at = telemetry_record.collected_at + timedelta(minutes=10)
    session.add(
        GraphEdge(
            environment_id=task_run.environment_id,
            source_host_id=task_run.host_id,
            target_host_id=target_host_id,
            target_label=target_endpoint,
            relation_kind="endpoint_connectivity",
            status="reachable" if payload.get("success") else "unreachable",
            observed_at=telemetry_record.collected_at,
            expires_at=expires_at,
            telemetry_record_id=telemetry_record.id,
            payload_json=payload,
        )
    )


def is_graph_edge_stale(edge: GraphEdge, *, now: datetime | None = None) -> bool:
    current_time = now or utcnow()
    return (
        edge.expires_at is not None
        and ensure_utc(edge.expires_at) <= current_time
    )


async def find_host_for_endpoint(
    session: AsyncSession,
    *,
    environment_id: str,
    endpoint: str,
) -> Host | None:
    host_or_ip = str(endpoint).split("://")[-1].split("/")[0].split(":")[0]
    return await session.scalar(
        select(Host).where(
            Host.environment_id == environment_id,
            or_(
                Host.hostname == host_or_ip,
                Host.primary_ipv4 == host_or_ip,
                Host.primary_ipv6 == host_or_ip,
                Host.name == host_or_ip,
            ),
        )
    )


async def set_agent_online(
    session: AsyncSession,
    *,
    agent: Agent,
    agent_version: str | None,
    capabilities_json: dict[str, Any] | None,
) -> None:
    agent.status = AgentStatus.ONLINE
    agent.last_seen_at = utcnow()
    if agent_version is not None:
        agent.agent_version = agent_version
    if capabilities_json is not None:
        agent.capabilities_json = capabilities_json


async def refresh_agent_state(
    session: AsyncSession,
    *,
    stale_after: timedelta = timedelta(seconds=30),
    offline_after: timedelta = timedelta(minutes=5),
) -> None:
    now = utcnow()
    agents = list(await session.scalars(select(Agent)))
    for agent in agents:
        if agent.last_seen_at is None:
            agent.status = AgentStatus.OFFLINE
            continue
        age = now - ensure_utc(agent.last_seen_at)
        if age > offline_after:
            agent.status = AgentStatus.OFFLINE
        elif age > stale_after:
            agent.status = AgentStatus.STALE
        else:
            agent.status = AgentStatus.ONLINE


def cron_matches(expr: str, value: datetime) -> bool:
    fields = expr.split()
    if len(fields) != 5:
        raise ValueError("Only 5-field CRON expressions are supported")

    minute, hour, day, month, weekday = fields
    return all(
        [
            _cron_field_matches(minute, value.minute, 0, 59),
            _cron_field_matches(hour, value.hour, 0, 23),
            _cron_field_matches(day, value.day, 1, 31),
            _cron_field_matches(month, value.month, 1, 12),
            _cron_field_matches(weekday, (value.weekday() + 1) % 7, 0, 6),
        ]
    )


def _cron_field_matches(expr: str, current: int, minimum: int, maximum: int) -> bool:
    for item in expr.split(","):
        item = item.strip()
        if item == "*":
            return True
        if item.startswith("*/"):
            step = int(item[2:])
            if (current - minimum) % step == 0:
                return True
            continue
        if "-" in item:
            start_raw, end_raw = item.split("-", 1)
            if int(start_raw) <= current <= int(end_raw):
                return True
            continue
        if int(item) == current:
            return True
    return False


def next_cron_run(expr: str, after: datetime) -> datetime:
    probe = after.replace(second=0, microsecond=0) + timedelta(minutes=1)
    for _ in range(60 * 24 * 366):
        if cron_matches(expr, probe):
            return probe
        probe += timedelta(minutes=1)
    raise ValueError(f"Unable to compute next run for CRON expression: {expr}")


async def expand_schedule_rules(session: AsyncSession) -> int:
    now = utcnow().replace(second=0, microsecond=0)
    rules = list(
        await session.scalars(
            select(ScheduleRule).where(ScheduleRule.is_enabled.is_(True))
        )
    )
    created_runs = 0

    for rule in rules:
        if rule.next_run_at is None:
            rule.next_run_at = next_cron_run(rule.cron_expr, now - timedelta(minutes=1))
        if rule.next_run_at > now:
            continue

        hosts = await resolve_schedule_hosts(
            session,
            environment_id=rule.environment_id,
            target_selector=rule.target_selector_json or {},
        )
        for host in hosts:
            session.add(
                TaskRun(
                    environment_id=rule.environment_id,
                    host_id=host.id,
                    agent_id=host.agent_id,
                    task_template_id=rule.task_template_id,
                    schedule_rule_id=rule.id,
                    status=TaskRunStatus.QUEUED,
                )
            )
            created_runs += 1

        rule.next_run_at = next_cron_run(rule.cron_expr, rule.next_run_at)

    if created_runs:
        await session.flush()
    return created_runs


async def resolve_schedule_hosts(
    session: AsyncSession,
    *,
    environment_id: str,
    target_selector: dict[str, Any],
) -> list[Host]:
    host_ids = target_selector.get("host_ids")
    if host_ids:
        return list(
            await session.scalars(
                select(Host).where(
                    Host.environment_id == environment_id,
                    Host.id.in_(host_ids),
                )
            )
        )
    return list(
        await session.scalars(
            select(Host).where(Host.environment_id == environment_id)
        )
    )


async def recover_expired_task_leases(session: AsyncSession) -> int:
    now = utcnow()
    task_runs = list(
        await session.scalars(
            select(TaskRun).where(
                TaskRun.status.in_(
                    [TaskRunStatus.LEASED, TaskRunStatus.RUNNING]
                ),
                TaskRun.leased_until.is_not(None),
                TaskRun.leased_until < now,
            )
        )
    )

    for task_run in task_runs:
        task_run.status = TaskRunStatus.EXPIRED
        task_run.finished_at = now
        task_run.failure_reason = "Lease expired"
        task_run.lease_token = None
        task_run.leased_until = None

    return len(task_runs)
