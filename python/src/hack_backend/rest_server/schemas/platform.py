from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_serializer


def _serialize_datetime_utc(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    else:
        value = value.astimezone(UTC)
    return value.isoformat().replace("+00:00", "Z")


def _normalize_datetimes(value: Any) -> Any:
    if isinstance(value, datetime):
        return _serialize_datetime_utc(value)
    if isinstance(value, dict):
        return {key: _normalize_datetimes(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_normalize_datetimes(item) for item in value]
    if isinstance(value, tuple):
        return tuple(_normalize_datetimes(item) for item in value)
    return value


class BaseDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    @model_serializer(mode="plain", when_used="json")
    def serialize_model(self) -> dict[str, Any]:
        return _normalize_datetimes(self.model_dump(mode="python"))


class ProjectDTO(BaseDTO):
    id: str
    name: str
    owner_id: str
    created_at: datetime


class EnvironmentDTO(BaseDTO):
    id: str
    name: str
    project_id: str
    created_at: datetime


class ProjectMemberDTO(BaseDTO):
    user_id: str
    email: str
    name: str
    role: str
    status: str
    invited_at: datetime


class EnvironmentMemberDTO(BaseDTO):
    user_id: str
    env_id: str
    role: str


class AgentDTO(BaseDTO):
    id: str
    project_id: str
    name: str
    declared_os: str | None = None
    safe_install: bool = False
    max_concurrent_tasks: int = 4
    status: str
    last_seen_at: datetime | None = None
    agent_version: str | None = None
    reported_agent_version: str | None = None
    capabilities_json: dict[str, Any] = Field(default_factory=dict)
    environments: list[EnvironmentDTO] = Field(default_factory=list)
    created_at: datetime


class HostListDTO(BaseDTO):
    id: str
    environment_id: str
    agent_id: str
    name: str
    hostname: str | None = None
    os_name: str | None = None
    status: str
    primary_ipv4: str | None = None
    primary_ipv6: str | None = None
    last_seen_at: datetime | None = None
    freshness: datetime | None = None
    descriptive_fields: dict[str, Any] = Field(default_factory=dict)


class HostDetailDTO(BaseDTO):
    id: str
    environment_id: str
    agent_id: str
    kind: str
    name: str
    internal_identifier: str
    descriptive_fields: dict[str, Any] = Field(default_factory=dict)
    hostname: str | None = None
    os_name: str | None = None
    primary_ipv4: str | None = None
    primary_ipv6: str | None = None
    metadata_last_refreshed_at: datetime | None = None


class TaskRunDTO(BaseDTO):
    id: str
    environment_id: str
    host_id: str
    agent_id: str
    task_template_id: str
    status: str
    attempt_no: int
    queued_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    failure_reason: str | None = None
    command: str
    task_name: str
    task_kind: str
    host_name: str
    agent_name: str


class TaskRunResultDTO(BaseDTO):
    task_run_id: str
    exit_code: int | None = None
    stdout_text: str | None = None
    stderr_text: str | None = None
    summary_json: dict[str, Any] | None = None
    created_at: datetime


class TelemetryRecordDTO(BaseDTO):
    id: str
    task_run_id: str
    host_id: str
    environment_id: str
    kind: str
    schema_version: int
    collected_at: datetime
    payload_json: dict[str, Any]


class MetricSnapshotDTO(BaseDTO):
    id: str
    host_id: str
    environment_id: str
    metric_kind: str
    computed_at: datetime
    value_json: dict[str, Any]


class GraphEdgeDTO(BaseDTO):
    id: str
    environment_id: str
    source_host_id: str
    target_host_id: str | None = None
    target_label: str | None = None
    relation_kind: str
    status: str
    observed_at: datetime
    expires_at: datetime | None = None
    payload_json: dict[str, Any] = Field(default_factory=dict)


class TaskTemplateDTO(BaseDTO):
    id: str
    project_id: str
    kind: str
    schema_version: int
    name: str
    payload_json: dict[str, Any] = Field(default_factory=dict)
    metric_policy_json: dict[str, Any] = Field(default_factory=dict)
    approved_command: str | None = None
    created_at: datetime


class ScheduleRuleDTO(BaseDTO):
    id: str
    environment_id: str
    task_template_id: str
    cron_expr: str
    target_selector_json: dict[str, Any] = Field(default_factory=dict)
    is_enabled: bool
    next_run_at: datetime | None = None
    created_at: datetime
    task_name: str
    task_kind: str


class InstallScriptDTO(BaseDTO):
    command: str
    agent_id: str
    version: str
    safe_install: bool = False
    platform: str
    script_kind: str
    script_url: str


class AgentExecutionTemplateDTO(BaseDTO):
    id: str
    kind: str
    name: str
    payload_json: dict[str, Any] = Field(default_factory=dict)
    approved_command: str | None = None


class AgentExecutionHostDTO(BaseDTO):
    id: str
    name: str
    hostname: str | None = None
    primary_ipv4: str | None = None
    primary_ipv6: str | None = None


class AgentTaskLeaseDTO(BaseDTO):
    id: str
    environment_id: str
    host_id: str
    lease_token: str
    lease_until: datetime
    task_template: AgentExecutionTemplateDTO
    host: AgentExecutionHostDTO
