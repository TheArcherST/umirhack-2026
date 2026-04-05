from __future__ import annotations

from typing import Any

from hack_backend.core.models import (
    Agent,
    ComplianceEvent,
    CompliancePolicy,
    CompliancePolicyRevision,
    Environment,
    EnvironmentMember,
    GraphEdge,
    Host,
    MetricSnapshot,
    Project,
    ProjectMember,
    ScheduleRule,
    TaskRun,
    TaskRunResult,
    TaskTemplate,
    TelemetryRecord,
    User,
)
from hack_backend.core.services.compliance_service import (
    ComplianceEventView,
    ComplianceFindingView,
)
from hack_backend.rest_server.schemas.platform import (
    AgentDTO,
    ComplianceCatalogItemDTO,
    ComplianceEventDTO,
    ComplianceFindingDTO,
    CompliancePolicyDTO,
    EnvironmentDTO,
    EnvironmentMemberDTO,
    GraphEdgeDTO,
    HostDetailDTO,
    HostListDTO,
    MetricSnapshotDTO,
    ProjectDTO,
    ProjectMemberDTO,
    ScheduleRuleDTO,
    TaskRunDTO,
    TaskRunResultDTO,
    TaskTemplateDTO,
    TelemetryRecordDTO,
)
from hack_backend.core.platform_ops import merged_payload


def _string_value(value: Any) -> str:
    return str(getattr(value, "value", value))


def project_to_dto(project: Project) -> ProjectDTO:
    return ProjectDTO(
        id=project.id,
        name=project.name,
        owner_id=str(project.owner_id),
        created_at=project.created_at,
    )


def environment_to_dto(environment: Environment) -> EnvironmentDTO:
    return EnvironmentDTO(
        id=environment.id,
        name=environment.name,
        project_id=environment.project_id,
        created_at=environment.created_at,
    )


def project_member_to_dto(
    member: ProjectMember,
    user: User,
) -> ProjectMemberDTO:
    role = "admin" if _string_value(member.role) == "admin" else "member"
    return ProjectMemberDTO(
        user_id=str(user.id),
        email=user.email or "",
        name=user.username,
        role=role,
        status=_string_value(member.invite_status),
        invited_at=member.invited_at,
    )


def environment_member_to_dto(member: EnvironmentMember) -> EnvironmentMemberDTO:
    return EnvironmentMemberDTO(
        user_id=str(member.user_id),
        env_id=member.environment_id,
        role=_string_value(member.role),
    )


def agent_to_dto(agent: Agent, environments: list[Environment]) -> AgentDTO:
    return AgentDTO(
        id=agent.id,
        project_id=agent.project_id,
        name=agent.name,
        declared_os=agent.declared_os,
        safe_install=bool(agent.safe_install),
        max_concurrent_tasks=int(agent.max_concurrent_tasks or 4),
        status=_string_value(agent.status),
        last_seen_at=agent.last_seen_at,
        agent_version=agent.agent_version,
        reported_agent_version=agent.reported_agent_version,
        capabilities_json=agent.capabilities_json or {},
        environments=[
            environment_to_dto(environment) for environment in environments
        ],
        created_at=agent.created_at,
    )


def host_list_to_dto(host: Host, *, agent: Agent) -> HostListDTO:
    return HostListDTO(
        id=host.id,
        environment_id=host.environment_id,
        agent_id=host.agent_id,
        name=host.name,
        hostname=host.hostname,
        os_name=host.os_name,
        status=_string_value(agent.status),
        primary_ipv4=host.primary_ipv4,
        primary_ipv6=host.primary_ipv6,
        last_seen_at=agent.last_seen_at,
        freshness=host.metadata_last_refreshed_at,
        descriptive_fields=host.descriptive_fields_json or {},
    )


def host_detail_to_dto(host: Host) -> HostDetailDTO:
    return HostDetailDTO(
        id=host.id,
        environment_id=host.environment_id,
        agent_id=host.agent_id,
        kind=host.kind,
        name=host.name,
        internal_identifier=host.internal_identifier,
        descriptive_fields=host.descriptive_fields_json or {},
        hostname=host.hostname,
        os_name=host.os_name,
        primary_ipv4=host.primary_ipv4,
        primary_ipv6=host.primary_ipv6,
        metadata_last_refreshed_at=host.metadata_last_refreshed_at,
    )


def task_run_to_dto(task_run: TaskRun) -> TaskRunDTO:
    resolved_payload = merged_payload(task_run.task_template, task_run)
    if task_run.task_template.kind == "agent.self_update":
        from_version = resolved_payload.get("from_version") or "unknown"
        to_version = resolved_payload.get("version") or "unknown"
        command = f"self-update {from_version} -> {to_version}"
    else:
        command = (
            resolved_payload.get("approved_command")
            or resolved_payload.get("target_endpoint")
            or task_run.task_template.approved_command
            or task_run.task_template.name
        )
    return TaskRunDTO(
        id=task_run.id,
        environment_id=task_run.environment_id,
        host_id=task_run.host_id,
        agent_id=task_run.agent_id,
        task_template_id=task_run.task_template_id,
        status=_string_value(task_run.status),
        attempt_no=task_run.attempt_no,
        queued_at=task_run.queued_at,
        started_at=task_run.started_at,
        finished_at=task_run.finished_at,
        failure_reason=task_run.failure_reason,
        command=str(command),
        task_name=task_run.task_template.name,
        task_kind=task_run.task_template.kind,
        host_name=task_run.host.name,
        agent_name=task_run.agent.name,
    )


def task_run_result_to_dto(result: TaskRunResult) -> TaskRunResultDTO:
    return TaskRunResultDTO(
        task_run_id=result.task_run_id,
        exit_code=result.exit_code,
        stdout_text=result.stdout_text,
        stderr_text=result.stderr_text,
        summary_json=result.summary_json,
        created_at=result.created_at,
    )


def telemetry_to_dto(record: TelemetryRecord) -> TelemetryRecordDTO:
    return TelemetryRecordDTO(
        id=record.id,
        task_run_id=record.task_run_id,
        host_id=record.host_id,
        environment_id=record.environment_id,
        kind=record.kind,
        schema_version=record.schema_version,
        collected_at=record.collected_at,
        payload_json=record.payload_json,
    )


def metric_to_dto(metric: MetricSnapshot) -> MetricSnapshotDTO:
    return MetricSnapshotDTO(
        id=metric.id,
        host_id=metric.host_id,
        environment_id=metric.environment_id,
        metric_kind=metric.metric_kind,
        computed_at=metric.computed_at,
        value_json=metric.value_json,
    )


def graph_edge_to_dto(edge: GraphEdge) -> GraphEdgeDTO:
    return GraphEdgeDTO(
        id=edge.id,
        environment_id=edge.environment_id,
        source_host_id=edge.source_host_id,
        target_host_id=edge.target_host_id,
        target_label=edge.target_label,
        relation_kind=edge.relation_kind,
        status=edge.status,
        observed_at=edge.observed_at,
        expires_at=edge.expires_at,
        payload_json=edge.payload_json,
    )


def task_template_to_dto(template: TaskTemplate) -> TaskTemplateDTO:
    return TaskTemplateDTO(
        id=template.id,
        project_id=template.project_id,
        kind=template.kind,
        schema_version=template.schema_version,
        name=template.name,
        payload_json=template.payload_json or {},
        metric_policy_json=template.metric_policy_json or {},
        approved_command=template.approved_command,
        created_at=template.created_at,
    )


def schedule_rule_to_dto(
    rule: ScheduleRule,
    template: TaskTemplate,
) -> ScheduleRuleDTO:
    return ScheduleRuleDTO(
        id=rule.id,
        environment_id=rule.environment_id,
        task_template_id=rule.task_template_id,
        cron_expr=rule.cron_expr,
        target_selector_json=rule.target_selector_json or {},
        is_enabled=rule.is_enabled,
        next_run_at=rule.next_run_at,
        created_at=rule.created_at,
        task_name=template.name,
        task_kind=template.kind,
    )


def compliance_catalog_item_to_dto(
    item: dict[str, Any],
) -> ComplianceCatalogItemDTO:
    return ComplianceCatalogItemDTO(
        entity_kind=str(item["entity_kind"]),
        label=str(item["label"]),
        description=str(item["description"]),
    )


def compliance_policy_with_revision_to_dto(
    policy: CompliancePolicy,
    revision: CompliancePolicyRevision | None,
) -> CompliancePolicyDTO:
    return CompliancePolicyDTO(
        id=policy.id,
        environment_id=policy.environment_id,
        name=policy.name,
        entity_kind=policy.entity_kind,
        mode=_string_value(policy.mode),
        description=policy.description,
        is_enabled=bool(policy.is_enabled),
        current_revision_id=revision.id if revision is not None else None,
        revision_no=revision.revision_no if revision is not None else None,
        rule_count=len((revision.definition_json or {}).get("rules") or [])
        if revision is not None
        else 0,
        definition_json=revision.definition_json or {} if revision is not None else {},
        created_at=policy.created_at,
    )


def compliance_finding_to_dto(
    finding: ComplianceFindingView,
) -> ComplianceFindingDTO:
    return ComplianceFindingDTO(
        policy_id=finding.policy.id,
        revision_id=finding.revision.id,
        revision_no=finding.revision.revision_no,
        policy_name=finding.policy.name,
        policy_mode=_string_value(finding.policy.mode),
        entity_kind=finding.policy.entity_kind,
        host_id=finding.finding.host_id,
        host_name=finding.host.name if finding.host is not None else None,
        subject_key=finding.finding.subject_key,
        subject_label=finding.finding.subject_label,
        matched_rule_labels=finding.matched_rule_labels,
        evidence_json=finding.finding.evidence_json or {},
        observed_at=finding.finding.observed_at,
        expires_at=finding.finding.expires_at,
    )


def compliance_event_to_dto(
    view: ComplianceEventView,
) -> ComplianceEventDTO:
    event: ComplianceEvent = view.event
    return ComplianceEventDTO(
        id=event.id,
        policy_id=view.policy.id,
        revision_id=view.revision.id,
        revision_no=view.revision.revision_no,
        policy_name=view.policy.name,
        entity_kind=view.policy.entity_kind,
        event_kind=_string_value(event.event_kind),
        event_origin=_string_value(event.event_origin),
        host_id=event.host_id,
        host_name=view.host.name if view.host is not None else None,
        subject_key=event.subject_key,
        subject_label=event.subject_label,
        happened_at=event.happened_at,
        payload_json=event.payload_json or {},
    )
