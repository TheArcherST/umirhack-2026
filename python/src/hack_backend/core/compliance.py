from __future__ import annotations

import hashlib
import ipaddress
import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from hack_backend.core.entity_resolution import (
    canonicalize_endpoint_host,
    host_matches_selector,
    host_resolution_aliases,
    host_selector_for_host,
    merge_host_selectors,
)
from hack_backend.core.models import (
    ComplianceCurrentFinding,
    ComplianceEvaluation,
    ComplianceEvent,
    ComplianceEventKind,
    ComplianceEventOrigin,
    ComplianceMode,
    CompliancePolicy,
    CompliancePolicyRevision,
    Host,
    MetricSnapshot,
    TelemetryRecord,
)

ENTITY_KIND_ENDPOINT_CONNECTIVITY = "endpoint_connectivity"
ENTITY_KIND_SERVICE_STATUS = "service_status"
ENTITY_KIND_COMMAND_OUTPUT = "command_output"
ENTITY_KIND_PORT_BINDING = "port_binding"

SUPPORTED_ENTITY_KINDS = {
    ENTITY_KIND_ENDPOINT_CONNECTIVITY,
    ENTITY_KIND_SERVICE_STATUS,
    ENTITY_KIND_COMMAND_OUTPUT,
    ENTITY_KIND_PORT_BINDING,
}


class ComplianceValidationError(ValueError):
    pass


def _telemetry_kind_for_entity_kind(entity_kind: str) -> str | None:
    if entity_kind == ENTITY_KIND_SERVICE_STATUS:
        return "diagnostic.command.service_status"
    if entity_kind == ENTITY_KIND_COMMAND_OUTPUT:
        return "diagnostic.command.custom"
    if entity_kind == ENTITY_KIND_PORT_BINDING:
        return "diagnostic.command.port_scan"
    return None


@dataclass(slots=True, frozen=True)
class ObservedEntity:
    subject_key: str
    subject_label: str
    host_id: str | None
    scope_key: str | None
    values: dict[str, Any]
    evidence_json: dict[str, Any]
    expires_at: datetime | None = None


@dataclass(slots=True, frozen=True)
class ExtractedSource:
    source_kind: str
    source_record_id: str
    observed_at: datetime
    authoritative_scope_key: str | None
    entities: list[ObservedEntity]


def normalize_policy_definition(
    *,
    entity_kind: str,
    definition_json: dict[str, Any] | None,
    available_hosts: list[Host],
) -> tuple[dict[str, Any], dict[str, Any]]:
    if entity_kind not in SUPPORTED_ENTITY_KINDS:
        raise ComplianceValidationError(
            f"Unsupported compliance entity kind: {entity_kind}"
        )

    definition = dict(definition_json or {})
    raw_rules = definition.get("rules")
    if not isinstance(raw_rules, list) or not raw_rules:
        raise ComplianceValidationError(
            "Compliance policy must contain at least one rule"
        )

    hosts_by_id = {host.id: host for host in available_hosts}
    if entity_kind == ENTITY_KIND_ENDPOINT_CONNECTIVITY:
        normalized_rules = [
            _normalize_endpoint_rule(
                index=index,
                raw_rule=raw_rule,
                hosts_by_id=hosts_by_id,
            )
            for index, raw_rule in enumerate(raw_rules)
        ]
        return {"rules": normalized_rules}, {
            "entity_kind": entity_kind,
            "rules": [
                _compile_endpoint_rule(rule, hosts_by_id=hosts_by_id)
                for rule in normalized_rules
            ],
        }

    if entity_kind == ENTITY_KIND_SERVICE_STATUS:
        normalized_rules = [
            _normalize_service_rule(
                index=index,
                raw_rule=raw_rule,
                hosts_by_id=hosts_by_id,
            )
            for index, raw_rule in enumerate(raw_rules)
        ]
        return {"rules": normalized_rules}, {
            "entity_kind": entity_kind,
            "rules": [
                _compile_service_rule(rule, hosts_by_id=hosts_by_id)
                for rule in normalized_rules
            ],
        }

    if entity_kind == ENTITY_KIND_COMMAND_OUTPUT:
        normalized_rules = [
            _normalize_command_output_rule(
                index=index,
                raw_rule=raw_rule,
                hosts_by_id=hosts_by_id,
            )
            for index, raw_rule in enumerate(raw_rules)
        ]
        return {"rules": normalized_rules}, {
            "entity_kind": entity_kind,
            "rules": [
                _compile_command_output_rule(rule, hosts_by_id=hosts_by_id)
                for rule in normalized_rules
            ],
        }

    normalized_rules = [
        _normalize_port_binding_rule(
            index=index,
            raw_rule=raw_rule,
            hosts_by_id=hosts_by_id,
        )
        for index, raw_rule in enumerate(raw_rules)
    ]
    return {"rules": normalized_rules}, {
        "entity_kind": entity_kind,
        "rules": [
            _compile_port_binding_rule(rule, hosts_by_id=hosts_by_id)
            for rule in normalized_rules
        ],
    }


async def rebuild_policy(
    session: AsyncSession,
    *,
    policy: CompliancePolicy,
    revision: CompliancePolicyRevision | None,
) -> None:
    await session.execute(
        delete(ComplianceCurrentFinding).where(
            ComplianceCurrentFinding.policy_id == policy.id
        )
    )

    if (
        not policy.is_enabled
        or policy.deleted_at is not None
        or revision is None
    ):
        return

    if policy.entity_kind == ENTITY_KIND_ENDPOINT_CONNECTIVITY:
        metrics = list(
            await session.scalars(
                select(MetricSnapshot)
                .where(
                    MetricSnapshot.environment_id == policy.environment_id,
                    MetricSnapshot.metric_kind
                    == ENTITY_KIND_ENDPOINT_CONNECTIVITY,
                )
                .order_by(
                    MetricSnapshot.computed_at.asc(),
                    MetricSnapshot.created_at.asc(),
                )
            )
        )
        for metric in metrics:
            await _apply_policy_to_metric(
                session,
                policy=policy,
                revision=revision,
                metric=metric,
                event_origin=ComplianceEventOrigin.BACKFILL,
            )
        return

    telemetry_kind = _telemetry_kind_for_entity_kind(policy.entity_kind)
    if telemetry_kind is None:
        return
    records = list(
        await session.scalars(
            select(TelemetryRecord)
            .where(
                TelemetryRecord.environment_id == policy.environment_id,
                TelemetryRecord.kind == telemetry_kind,
            )
            .order_by(
                TelemetryRecord.collected_at.asc(),
                TelemetryRecord.created_at.asc(),
            )
        )
    )
    for record in records:
        await _apply_policy_to_telemetry(
            session,
            policy=policy,
            revision=revision,
            telemetry_record=record,
            event_origin=ComplianceEventOrigin.BACKFILL,
        )


async def apply_compliance_materialization(
    session: AsyncSession,
    *,
    environment_id: str,
    telemetry_record: TelemetryRecord | None = None,
    metric_snapshots: list[MetricSnapshot] | None = None,
) -> None:
    relevant_entity_kinds: set[str] = set()
    if (
        telemetry_record is not None
        and telemetry_record.kind == "diagnostic.command.service_status"
    ):
        relevant_entity_kinds.add(ENTITY_KIND_SERVICE_STATUS)
    if (
        telemetry_record is not None
        and telemetry_record.kind == "diagnostic.command.custom"
    ):
        relevant_entity_kinds.add(ENTITY_KIND_COMMAND_OUTPUT)
    if (
        telemetry_record is not None
        and telemetry_record.kind == "diagnostic.command.port_scan"
    ):
        relevant_entity_kinds.add(ENTITY_KIND_PORT_BINDING)
    if metric_snapshots and any(
        metric.metric_kind == ENTITY_KIND_ENDPOINT_CONNECTIVITY
        for metric in metric_snapshots
    ):
        relevant_entity_kinds.add(ENTITY_KIND_ENDPOINT_CONNECTIVITY)

    if not relevant_entity_kinds:
        return

    policies = list(
        await session.scalars(
            select(CompliancePolicy).where(
                CompliancePolicy.environment_id == environment_id,
                CompliancePolicy.is_enabled.is_(True),
                CompliancePolicy.deleted_at.is_(None),
                CompliancePolicy.current_revision_id.is_not(None),
                CompliancePolicy.entity_kind.in_(sorted(relevant_entity_kinds)),
            )
        )
    )
    if not policies:
        return

    revisions_by_id = {
        revision.id: revision
        for revision in await session.scalars(
            select(CompliancePolicyRevision).where(
                CompliancePolicyRevision.id.in_(
                    [policy.current_revision_id for policy in policies if policy.current_revision_id]
                )
            )
        )
    }

    for policy in policies:
        revision = revisions_by_id.get(policy.current_revision_id or "")
        if revision is None:
            continue
        if (
            telemetry_record is not None
            and policy.entity_kind == ENTITY_KIND_SERVICE_STATUS
        ):
            await _apply_policy_to_telemetry(
                session,
                policy=policy,
                revision=revision,
                telemetry_record=telemetry_record,
                event_origin=ComplianceEventOrigin.LIVE,
            )
        if (
            telemetry_record is not None
            and policy.entity_kind in {ENTITY_KIND_COMMAND_OUTPUT, ENTITY_KIND_PORT_BINDING}
        ):
            await _apply_policy_to_telemetry(
                session,
                policy=policy,
                revision=revision,
                telemetry_record=telemetry_record,
                event_origin=ComplianceEventOrigin.LIVE,
            )
        if metric_snapshots and policy.entity_kind == ENTITY_KIND_ENDPOINT_CONNECTIVITY:
            for metric in metric_snapshots:
                if metric.metric_kind != ENTITY_KIND_ENDPOINT_CONNECTIVITY:
                    continue
                await _apply_policy_to_metric(
                    session,
                    policy=policy,
                    revision=revision,
                    metric=metric,
                    event_origin=ComplianceEventOrigin.LIVE,
                )


def _normalize_rule_id(raw_value: Any, *, index: int) -> str:
    text = str(raw_value or "").strip().lower().replace(" ", "-")
    if text:
        return text[:64]
    return f"rule-{index + 1}"


def _normalize_rule_label(raw_value: Any, *, index: int) -> str:
    text = str(raw_value or "").strip()
    if text:
        return text[:120]
    return f"Rule {index + 1}"


def _normalize_host_id_list(
    value: Any,
    *,
    hosts_by_id: dict[str, Host],
    field_name: str,
) -> list[str]:
    if value in (None, "", []):
        return []
    if not isinstance(value, list):
        raise ComplianceValidationError(f"{field_name} must be a list of host ids")

    normalized: list[str] = []
    for raw_item in value:
        host_id = str(raw_item or "").strip()
        if not host_id:
            continue
        if host_id not in hosts_by_id:
            raise ComplianceValidationError(
                f"{field_name} contains unknown host id: {host_id}"
            )
        if host_id not in normalized:
            normalized.append(host_id)
    return normalized


def _normalize_endpoint_rule(
    *,
    index: int,
    raw_rule: Any,
    hosts_by_id: dict[str, Host],
) -> dict[str, Any]:
    if not isinstance(raw_rule, dict):
        raise ComplianceValidationError("Each endpoint rule must be an object")

    source_host_ids = _normalize_host_id_list(
        raw_rule.get("source_host_ids"),
        hosts_by_id=hosts_by_id,
        field_name="source_host_ids",
    )
    target_host_ids = _normalize_host_id_list(
        raw_rule.get("target_host_ids"),
        hosts_by_id=hosts_by_id,
        field_name="target_host_ids",
    )
    target_endpoint = str(raw_rule.get("target_endpoint") or "").strip() or None
    if target_host_ids and target_endpoint:
        raise ComplianceValidationError(
            "Endpoint rule may target hosts or a literal endpoint, not both"
        )

    connectivity = str(raw_rule.get("connectivity") or "any").strip().lower()
    if connectivity not in {"any", "reachable", "unreachable"}:
        raise ComplianceValidationError(
            "Endpoint rule connectivity must be any, reachable, or unreachable"
        )

    raw_latency = raw_rule.get("max_latency_ms")
    max_latency_ms: float | None
    if raw_latency in (None, ""):
        max_latency_ms = None
    else:
        try:
            max_latency_ms = float(raw_latency)
        except (TypeError, ValueError) as exc:
            raise ComplianceValidationError(
                "Endpoint rule max_latency_ms must be numeric"
            ) from exc
        if max_latency_ms < 0:
            raise ComplianceValidationError(
                "Endpoint rule max_latency_ms must be non-negative"
            )

    return {
        "id": _normalize_rule_id(raw_rule.get("id"), index=index),
        "label": _normalize_rule_label(raw_rule.get("label"), index=index),
        "source_host_ids": source_host_ids,
        "target_host_ids": target_host_ids,
        "target_endpoint": target_endpoint,
        "connectivity": connectivity,
        "max_latency_ms": max_latency_ms,
    }


def _normalize_service_rule(
    *,
    index: int,
    raw_rule: Any,
    hosts_by_id: dict[str, Host],
) -> dict[str, Any]:
    if not isinstance(raw_rule, dict):
        raise ComplianceValidationError("Each service rule must be an object")

    service_name = str(raw_rule.get("service_name") or "").strip()
    if not service_name:
        raise ComplianceValidationError("Service rule must define service_name")

    status = str(raw_rule.get("status") or "any").strip().lower()
    if status not in {"any", "running", "stopped"}:
        raise ComplianceValidationError(
            "Service rule status must be any, running, or stopped"
        )

    return {
        "id": _normalize_rule_id(raw_rule.get("id"), index=index),
        "label": _normalize_rule_label(raw_rule.get("label"), index=index),
        "host_ids": _normalize_host_id_list(
            raw_rule.get("host_ids"),
            hosts_by_id=hosts_by_id,
            field_name="host_ids",
        ),
        "service_name": service_name,
        "status": status,
    }


def _normalize_command_output_rule(
    *,
    index: int,
    raw_rule: Any,
    hosts_by_id: dict[str, Host],
) -> dict[str, Any]:
    if not isinstance(raw_rule, dict):
        raise ComplianceValidationError("Each command output rule must be an object")

    output_pattern = str(raw_rule.get("output_pattern") or "").strip()
    if not output_pattern:
        raise ComplianceValidationError(
            "Command output rule must define output_pattern"
        )
    _ensure_valid_regex(output_pattern, field_name="output_pattern")

    command_pattern = str(raw_rule.get("command_pattern") or "").strip() or None
    if command_pattern is not None:
        _ensure_valid_regex(command_pattern, field_name="command_pattern")

    return {
        "id": _normalize_rule_id(raw_rule.get("id"), index=index),
        "label": _normalize_rule_label(raw_rule.get("label"), index=index),
        "host_ids": _normalize_host_id_list(
            raw_rule.get("host_ids"),
            hosts_by_id=hosts_by_id,
            field_name="host_ids",
        ),
        "command_pattern": command_pattern,
        "output_pattern": output_pattern,
    }


def _normalize_port_binding_rule(
    *,
    index: int,
    raw_rule: Any,
    hosts_by_id: dict[str, Host],
) -> dict[str, Any]:
    if not isinstance(raw_rule, dict):
        raise ComplianceValidationError("Each port binding rule must be an object")

    protocol = str(raw_rule.get("protocol") or "any").strip().lower()
    if protocol not in {"any", "tcp", "udp"}:
        raise ComplianceValidationError(
            "Port binding rule protocol must be any, tcp, or udp"
        )

    state = str(raw_rule.get("state") or "any").strip().lower()
    if state not in {"any", "listening", "established"}:
        raise ComplianceValidationError(
            "Port binding rule state must be any, listening, or established"
        )

    local_address = str(raw_rule.get("local_address") or "").strip().lower() or None
    local_subnet = str(raw_rule.get("local_subnet") or "").strip() or None
    if local_address and local_subnet:
        raise ComplianceValidationError(
            "Port binding rule may define local_address or local_subnet, not both"
        )
    if local_subnet is not None:
        try:
            ipaddress.ip_network(local_subnet, strict=False)
        except ValueError as exc:
            raise ComplianceValidationError(
                "Port binding rule local_subnet must be a valid subnet"
            ) from exc

    port_from = _normalize_port_number(raw_rule.get("port_from"), field_name="port_from")
    port_to = _normalize_port_number(raw_rule.get("port_to"), field_name="port_to")
    if port_from is not None and port_to is not None and port_from > port_to:
        raise ComplianceValidationError("port_from must be less than or equal to port_to")

    return {
        "id": _normalize_rule_id(raw_rule.get("id"), index=index),
        "label": _normalize_rule_label(raw_rule.get("label"), index=index),
        "host_ids": _normalize_host_id_list(
            raw_rule.get("host_ids"),
            hosts_by_id=hosts_by_id,
            field_name="host_ids",
        ),
        "protocol": protocol,
        "local_address": local_address,
        "local_subnet": local_subnet,
        "state": state,
        "port_from": port_from,
        "port_to": port_to,
    }


def _ensure_valid_regex(pattern: str, *, field_name: str) -> None:
    try:
        re.compile(pattern, re.IGNORECASE)
    except re.error as exc:
        raise ComplianceValidationError(
            f"{field_name} must be a valid regular expression"
        ) from exc


def _normalize_port_number(value: Any, *, field_name: str) -> int | None:
    if value in (None, ""):
        return None
    try:
        port = int(value)
    except (TypeError, ValueError) as exc:
        raise ComplianceValidationError(f"{field_name} must be an integer") from exc
    if not 1 <= port <= 65535:
        raise ComplianceValidationError(
            f"{field_name} must be between 1 and 65535"
        )
    return port


def _compile_host_selector(
    host_ids: list[str],
    *,
    hosts_by_id: dict[str, Host],
) -> dict[str, Any] | None:
    if not host_ids:
        return None
    return merge_host_selectors(
        [host_selector_for_host(hosts_by_id[host_id]) for host_id in host_ids]
    )


def _compile_endpoint_rule(
    rule: dict[str, Any],
    *,
    hosts_by_id: dict[str, Host],
) -> dict[str, Any]:
    clauses: list[dict[str, Any]] = []
    source_selector = _compile_host_selector(
        rule["source_host_ids"],
        hosts_by_id=hosts_by_id,
    )
    target_selector = _compile_host_selector(
        rule["target_host_ids"],
        hosts_by_id=hosts_by_id,
    )
    if source_selector is not None:
        clauses.append(
            {
                "field": "source_host",
                "operator": "host_selector",
                "value": source_selector,
            }
        )
    if target_selector is not None:
        clauses.append(
            {
                "field": "target_host",
                "operator": "host_selector",
                "value": target_selector,
            }
        )
    if rule["target_endpoint"]:
        clauses.append(
            {
                "field": "target_endpoint_canonical",
                "operator": "equals_ci",
                "value": canonicalize_endpoint_host(rule["target_endpoint"]),
            }
        )
    if rule["connectivity"] != "any":
        clauses.append(
            {
                "field": "success",
                "operator": "bool_equals",
                "value": rule["connectivity"] == "reachable",
            }
        )
    if rule["max_latency_ms"] is not None:
        clauses.append(
            {
                "field": "latency_ms",
                "operator": "lte_number",
                "value": rule["max_latency_ms"],
            }
        )
    return {
        "id": rule["id"],
        "label": rule["label"],
        "clauses": clauses,
    }


def _compile_service_rule(
    rule: dict[str, Any],
    *,
    hosts_by_id: dict[str, Host],
) -> dict[str, Any]:
    clauses: list[dict[str, Any]] = [
        {
            "field": "service_name",
            "operator": "equals_ci",
            "value": rule["service_name"],
        }
    ]
    host_selector = _compile_host_selector(
        rule["host_ids"],
        hosts_by_id=hosts_by_id,
    )
    if host_selector is not None:
        clauses.append(
            {
                "field": "host",
                "operator": "host_selector",
                "value": host_selector,
            }
        )
    if rule["status"] != "any":
        clauses.append(
            {
                "field": "status",
                "operator": "equals_ci",
                "value": rule["status"],
            }
        )
    return {
        "id": rule["id"],
        "label": rule["label"],
        "clauses": clauses,
    }


def _compile_command_output_rule(
    rule: dict[str, Any],
    *,
    hosts_by_id: dict[str, Host],
) -> dict[str, Any]:
    clauses: list[dict[str, Any]] = []
    host_selector = _compile_host_selector(
        rule["host_ids"],
        hosts_by_id=hosts_by_id,
    )
    if host_selector is not None:
        clauses.append(
            {
                "field": "host",
                "operator": "host_selector",
                "value": host_selector,
            }
        )
    if rule["command_pattern"]:
        clauses.append(
            {
                "field": "command_text",
                "operator": "regex_search",
                "value": rule["command_pattern"],
            }
        )
    clauses.append(
        {
            "field": "output_text",
            "operator": "regex_search",
            "value": rule["output_pattern"],
        }
    )
    return {
        "id": rule["id"],
        "label": rule["label"],
        "clauses": clauses,
    }


def _compile_port_binding_rule(
    rule: dict[str, Any],
    *,
    hosts_by_id: dict[str, Host],
) -> dict[str, Any]:
    clauses: list[dict[str, Any]] = []
    host_selector = _compile_host_selector(
        rule["host_ids"],
        hosts_by_id=hosts_by_id,
    )
    if host_selector is not None:
        clauses.append(
            {
                "field": "host",
                "operator": "host_selector",
                "value": host_selector,
            }
        )
    if rule["protocol"] != "any":
        clauses.append(
            {
                "field": "protocol",
                "operator": "equals_ci",
                "value": rule["protocol"],
            }
        )
    if rule["local_address"]:
        clauses.append(
            {
                "field": "local_address",
                "operator": "equals_ci",
                "value": rule["local_address"],
            }
        )
    if rule["local_subnet"]:
        clauses.append(
            {
                "field": "local_address",
                "operator": "ip_in_subnet",
                "value": rule["local_subnet"],
            }
        )
    if rule["state"] != "any":
        clauses.append(
            {
                "field": "state",
                "operator": "equals_ci",
                "value": rule["state"],
            }
        )
    if rule["port_from"] is not None:
        clauses.append(
            {
                "field": "port",
                "operator": "gte_number",
                "value": rule["port_from"],
            }
        )
    if rule["port_to"] is not None:
        clauses.append(
            {
                "field": "port",
                "operator": "lte_number",
                "value": rule["port_to"],
            }
        )
    return {
        "id": rule["id"],
        "label": rule["label"],
        "clauses": clauses,
    }


def _evaluate_compiled_policy(
    *,
    compiled_json: dict[str, Any],
    mode: ComplianceMode,
    entity_values: dict[str, Any],
) -> tuple[bool, list[str]]:
    matched_rule_ids: list[str] = []
    for rule in compiled_json.get("rules") or []:
        if _rule_matches(rule=rule, entity_values=entity_values):
            matched_rule_ids.append(str(rule["id"]))

    if mode == ComplianceMode.BLACKLIST:
        return bool(matched_rule_ids), matched_rule_ids
    return not matched_rule_ids, matched_rule_ids


def _rule_matches(*, rule: dict[str, Any], entity_values: dict[str, Any]) -> bool:
    return all(
        _clause_matches(clause=clause, entity_values=entity_values)
        for clause in rule.get("clauses") or []
    )


def _clause_matches(*, clause: dict[str, Any], entity_values: dict[str, Any]) -> bool:
    field = str(clause["field"])
    operator = str(clause["operator"])
    expected = clause.get("value")
    actual = entity_values.get(field)

    if operator == "equals_ci":
        return str(actual or "").strip().lower() == str(expected or "").strip().lower()
    if operator == "bool_equals":
        return bool(actual) is bool(expected)
    if operator == "lte_number":
        if actual is None:
            return False
        try:
            return float(actual) <= float(expected)
        except (TypeError, ValueError):
            return False
    if operator == "gte_number":
        if actual is None:
            return False
        try:
            return float(actual) >= float(expected)
        except (TypeError, ValueError):
            return False
    if operator == "regex_search":
        try:
            pattern = re.compile(str(expected or ""), re.IGNORECASE)
        except re.error:
            return False
        return bool(pattern.search(str(actual or "")))
    if operator == "ip_in_subnet":
        try:
            network = ipaddress.ip_network(str(expected), strict=False)
            return ipaddress.ip_address(str(actual)) in network
        except ValueError:
            return False
    if operator == "host_selector":
        if not isinstance(actual, dict):
            return False
        return host_matches_selector(
            expected,
            host=actual.get("host"),
            host_id=actual.get("host_id"),
        )
    raise ComplianceValidationError(f"Unsupported compliance operator: {operator}")


async def _apply_policy_to_metric(
    session: AsyncSession,
    *,
    policy: CompliancePolicy,
    revision: CompliancePolicyRevision,
    metric: MetricSnapshot,
    event_origin: ComplianceEventOrigin,
) -> None:
    extracted = await _extract_metric_source(
        session,
        policy=policy,
        metric=metric,
    )
    if extracted is None:
        return
    await _apply_extracted_source(
        session,
        policy=policy,
        revision=revision,
        extracted=extracted,
        event_origin=event_origin,
    )


async def _apply_policy_to_telemetry(
    session: AsyncSession,
    *,
    policy: CompliancePolicy,
    revision: CompliancePolicyRevision,
    telemetry_record: TelemetryRecord,
    event_origin: ComplianceEventOrigin,
) -> None:
    extracted = await _extract_telemetry_source(
        session,
        policy=policy,
        telemetry_record=telemetry_record,
    )
    if extracted is None:
        return
    await _apply_extracted_source(
        session,
        policy=policy,
        revision=revision,
        extracted=extracted,
        event_origin=event_origin,
    )


async def _extract_metric_source(
    session: AsyncSession,
    *,
    policy: CompliancePolicy,
    metric: MetricSnapshot,
) -> ExtractedSource | None:
    if (
        policy.entity_kind != ENTITY_KIND_ENDPOINT_CONNECTIVITY
        or metric.metric_kind != ENTITY_KIND_ENDPOINT_CONNECTIVITY
    ):
        return None

    hosts = await _load_environment_hosts(session, environment_id=policy.environment_id)
    hosts_by_id = {host.id: host for host in hosts}
    endpoint_index = _build_host_endpoint_index(hosts)

    payload = metric.value_json or {}
    source_host = hosts_by_id.get(metric.host_id)
    target_endpoint = str(payload.get("target_endpoint") or "").strip()
    canonical_target_endpoint = canonicalize_endpoint_host(target_endpoint)
    target_host = (
        endpoint_index.get(canonical_target_endpoint)
        if canonical_target_endpoint is not None
        else None
    )
    latency_ms = payload.get("latency_ms")
    try:
        normalized_latency_ms = (
            None if latency_ms in (None, "") else float(latency_ms)
        )
    except (TypeError, ValueError):
        normalized_latency_ms = None

    source_label = source_host.name if source_host else metric.host_id
    target_label = (
        target_host.name
        if target_host is not None
        else target_endpoint or "unknown target"
    )
    subject_suffix = (
        target_host.internal_identifier
        if target_host is not None
        else canonical_target_endpoint or "unknown-target"
    )
    entity = ObservedEntity(
        subject_key=f"endpoint:{metric.host_id}:{subject_suffix}",
        subject_label=f"{source_label} -> {target_label}",
        host_id=metric.host_id,
        scope_key=None,
        values={
            "source_host": {"host": source_host, "host_id": metric.host_id},
            "target_host": {
                "host": target_host,
                "host_id": target_host.id if target_host is not None else None,
            },
            "target_endpoint_canonical": canonical_target_endpoint,
            "success": bool(payload.get("success")),
            "latency_ms": normalized_latency_ms,
        },
        evidence_json={
            "target_endpoint": target_endpoint,
            "target_endpoint_canonical": canonical_target_endpoint,
            "target_host_id": target_host.id if target_host is not None else None,
            "target_host_name": target_host.name if target_host is not None else None,
            "success": bool(payload.get("success")),
            "latency_ms": normalized_latency_ms,
        },
        expires_at=metric.computed_at + timedelta(minutes=10),
    )
    return ExtractedSource(
        source_kind="metric_snapshot",
        source_record_id=metric.id,
        observed_at=metric.computed_at,
        authoritative_scope_key=None,
        entities=[entity],
    )


async def _extract_telemetry_source(
    session: AsyncSession,
    *,
    policy: CompliancePolicy,
    telemetry_record: TelemetryRecord,
) -> ExtractedSource | None:
    hosts = await _load_environment_hosts(session, environment_id=policy.environment_id)
    host = next((item for item in hosts if item.id == telemetry_record.host_id), None)
    host_label = host.name if host is not None else telemetry_record.host_id

    if (
        policy.entity_kind == ENTITY_KIND_SERVICE_STATUS
        and telemetry_record.kind == "diagnostic.command.service_status"
    ):
        return _extract_service_status_source(
            telemetry_record=telemetry_record,
            host=host,
            host_label=host_label,
        )
    if (
        policy.entity_kind == ENTITY_KIND_COMMAND_OUTPUT
        and telemetry_record.kind == "diagnostic.command.custom"
    ):
        return _extract_command_output_source(
            telemetry_record=telemetry_record,
            host=host,
            host_label=host_label,
        )
    if (
        policy.entity_kind == ENTITY_KIND_PORT_BINDING
        and telemetry_record.kind == "diagnostic.command.port_scan"
    ):
        return _extract_port_binding_source(
            telemetry_record=telemetry_record,
            host=host,
            host_label=host_label,
        )
    return None


def _extract_service_status_source(
    *,
    telemetry_record: TelemetryRecord,
    host: Host | None,
    host_label: str,
) -> ExtractedSource:
    raw_services = telemetry_record.payload_json.get("services") or []
    if not isinstance(raw_services, list):
        raw_services = []

    entities: list[ObservedEntity] = []
    for raw_service in raw_services:
        if not isinstance(raw_service, dict):
            continue
        service_name = str(raw_service.get("name") or "").strip()
        if not service_name:
            continue
        service_status = str(raw_service.get("status") or "").strip().lower()
        entities.append(
            ObservedEntity(
                subject_key=(
                    f"service:{telemetry_record.host_id}:{service_name.lower()}"
                ),
                subject_label=f"{host_label}: {service_name}",
                host_id=telemetry_record.host_id,
                scope_key=f"service-status:{telemetry_record.host_id}",
                values={
                    "host": {"host": host, "host_id": telemetry_record.host_id},
                    "service_name": service_name,
                    "status": service_status,
                },
                evidence_json={
                    "service_name": service_name,
                    "status": service_status,
                    "service": {
                        "name": service_name,
                        "status": service_status,
                        "display_name": raw_service.get("display_name"),
                        "description": raw_service.get("description"),
                        "active_state": raw_service.get("active_state"),
                        "sub_state": raw_service.get("sub_state"),
                    },
                },
            )
        )

    return ExtractedSource(
        source_kind="telemetry_record",
        source_record_id=telemetry_record.id,
        observed_at=telemetry_record.collected_at,
        authoritative_scope_key=f"service-status:{telemetry_record.host_id}",
        entities=entities,
    )


def _extract_command_output_source(
    *,
    telemetry_record: TelemetryRecord,
    host: Host | None,
    host_label: str,
) -> ExtractedSource:
    payload = telemetry_record.payload_json or {}
    command = str(payload.get("command") or "").strip()
    sample = str(payload.get("sample") or "")
    command_key = _stable_text_key(command or telemetry_record.id)
    subject_key = f"command-output:{telemetry_record.host_id}:{command_key}"
    subject_label = (
        f"{host_label}: {command}"
        if command
        else f"{host_label}: custom command"
    )
    return ExtractedSource(
        source_kind="telemetry_record",
        source_record_id=telemetry_record.id,
        observed_at=telemetry_record.collected_at,
        authoritative_scope_key=subject_key,
        entities=[
            ObservedEntity(
                subject_key=subject_key,
                subject_label=subject_label,
                host_id=telemetry_record.host_id,
                scope_key=subject_key,
                values={
                    "host": {"host": host, "host_id": telemetry_record.host_id},
                    "command_text": command,
                    "output_text": sample,
                    "exit_code": payload.get("exit_code"),
                },
                evidence_json={
                    "command": command,
                    "sample": sample,
                    "exit_code": payload.get("exit_code"),
                    "stderr": payload.get("stderr"),
                },
            )
        ],
    )


def _extract_port_binding_source(
    *,
    telemetry_record: TelemetryRecord,
    host: Host | None,
    host_label: str,
) -> ExtractedSource:
    raw_ports = telemetry_record.payload_json.get("ports") or []
    if not isinstance(raw_ports, list):
        raw_ports = []

    entities: list[ObservedEntity] = []
    for raw_port in raw_ports:
        if not isinstance(raw_port, dict):
            continue
        protocol = str(raw_port.get("protocol") or "").strip().lower()
        local_address = str(raw_port.get("local_address") or "").strip().lower()
        state = str(raw_port.get("state") or "").strip().lower()
        try:
            port = int(raw_port.get("port"))
        except (TypeError, ValueError):
            continue
        if not protocol or not local_address or not state:
            continue

        subject_key = (
            f"port-binding:{telemetry_record.host_id}:{protocol}:{local_address}:{port}"
        )
        entities.append(
            ObservedEntity(
                subject_key=subject_key,
                subject_label=f"{host_label}: {protocol}/{port} on {local_address}",
                host_id=telemetry_record.host_id,
                scope_key=f"port-binding:{telemetry_record.host_id}",
                values={
                    "host": {"host": host, "host_id": telemetry_record.host_id},
                    "protocol": protocol,
                    "port": port,
                    "local_address": local_address,
                    "state": state,
                },
                evidence_json={
                    "protocol": protocol,
                    "port": port,
                    "local_address": local_address,
                    "state": state,
                    "process": raw_port.get("process"),
                },
            )
        )

    return ExtractedSource(
        source_kind="telemetry_record",
        source_record_id=telemetry_record.id,
        observed_at=telemetry_record.collected_at,
        authoritative_scope_key=f"port-binding:{telemetry_record.host_id}",
        entities=entities,
    )


async def _apply_extracted_source(
    session: AsyncSession,
    *,
    policy: CompliancePolicy,
    revision: CompliancePolicyRevision,
    extracted: ExtractedSource,
    event_origin: ComplianceEventOrigin,
) -> None:
    previous_by_subject: dict[str, ComplianceCurrentFinding] = {}
    if extracted.authoritative_scope_key is not None:
        previous_by_subject = await _current_findings_for_scope(
            session,
            policy_id=policy.id,
            scope_key=extracted.authoritative_scope_key,
        )

    observed_subjects: set[str] = set()
    for entity in extracted.entities:
        observed_subjects.add(entity.subject_key)
        is_violation, matched_rule_ids = _evaluate_compiled_policy(
            compiled_json=revision.compiled_json or {},
            mode=policy.mode,
            entity_values=entity.values,
        )
        await _append_evaluation(
            session,
            policy=policy,
            revision=revision,
            entity=entity,
            source_kind=extracted.source_kind,
            source_record_id=extracted.source_record_id,
            observed_at=extracted.observed_at,
            is_violation=is_violation,
            matched_rule_ids=matched_rule_ids,
            evidence_json=entity.evidence_json,
            expires_at=entity.expires_at,
            event_origin=event_origin,
        )

    if extracted.authoritative_scope_key is None:
        return

    for subject_key, previous in previous_by_subject.items():
        if subject_key in observed_subjects:
            continue
        if not _is_active_violation(
            previous.is_violation,
            expires_at=previous.expires_at,
            at=extracted.observed_at,
        ):
            continue
        clearing_entity = ObservedEntity(
            subject_key=subject_key,
            subject_label=previous.subject_label,
            host_id=previous.host_id,
            scope_key=previous.scope_key,
            values={},
            evidence_json={
                "cleared_by_snapshot": True,
                "previous_evaluation_id": previous.latest_evaluation_id,
            },
        )
        await _append_evaluation(
            session,
            policy=policy,
            revision=revision,
            entity=clearing_entity,
            source_kind=extracted.source_kind,
            source_record_id=extracted.source_record_id,
            observed_at=extracted.observed_at,
            is_violation=False,
            matched_rule_ids=[],
            evidence_json=clearing_entity.evidence_json,
            expires_at=None,
            event_origin=event_origin,
        )


async def _append_evaluation(
    session: AsyncSession,
    *,
    policy: CompliancePolicy,
    revision: CompliancePolicyRevision,
    entity: ObservedEntity,
    source_kind: str,
    source_record_id: str,
    observed_at: datetime,
    is_violation: bool,
    matched_rule_ids: list[str],
    evidence_json: dict[str, Any],
    expires_at: datetime | None,
    event_origin: ComplianceEventOrigin,
) -> None:
    previous = await _current_finding_for_subject(
        session,
        policy_id=policy.id,
        subject_key=entity.subject_key,
    )

    evaluation = ComplianceEvaluation(
        policy_id=policy.id,
        revision_id=revision.id,
        environment_id=policy.environment_id,
        host_id=entity.host_id,
        entity_kind=policy.entity_kind,
        subject_key=entity.subject_key,
        subject_label=entity.subject_label,
        scope_key=entity.scope_key,
        source_kind=source_kind,
        source_record_id=source_record_id,
        observed_at=observed_at,
        is_violation=is_violation,
        event_origin=event_origin,
        matched_rule_ids_json=matched_rule_ids,
        evidence_json=evidence_json,
        expires_at=expires_at,
    )
    session.add(evaluation)
    await session.flush()

    previous_is_violation = (
        _is_active_violation(
            previous.is_violation,
            expires_at=previous.expires_at,
            at=observed_at,
        )
        if previous is not None
        else False
    )
    current_is_violation = _is_active_violation(
        is_violation,
        expires_at=expires_at,
        at=observed_at,
    )

    await _upsert_current_finding(
        session,
        policy=policy,
        revision=revision,
        evaluation=evaluation,
        entity=entity,
        matched_rule_ids=matched_rule_ids,
        evidence_json=evidence_json,
        is_violation=is_violation,
        observed_at=observed_at,
        expires_at=expires_at,
    )

    if not previous_is_violation and current_is_violation:
        session.add(
            ComplianceEvent(
                policy_id=policy.id,
                revision_id=revision.id,
                evaluation_id=evaluation.id,
                environment_id=policy.environment_id,
                host_id=entity.host_id,
                entity_kind=policy.entity_kind,
                subject_key=entity.subject_key,
                subject_label=entity.subject_label,
                event_kind=ComplianceEventKind.RISE,
                event_origin=event_origin,
                happened_at=observed_at,
                payload_json={
                    "matched_rule_ids": matched_rule_ids,
                    "evidence": evidence_json,
                },
            )
        )
    elif previous_is_violation and not current_is_violation:
        session.add(
            ComplianceEvent(
                policy_id=policy.id,
                revision_id=revision.id,
                evaluation_id=evaluation.id,
                environment_id=policy.environment_id,
                host_id=entity.host_id,
                entity_kind=policy.entity_kind,
                subject_key=entity.subject_key,
                subject_label=entity.subject_label,
                event_kind=ComplianceEventKind.RESOLVED,
                event_origin=event_origin,
                happened_at=observed_at,
                payload_json={
                    "matched_rule_ids": matched_rule_ids,
                    "evidence": evidence_json,
                },
            )
        )


def _is_active_violation(
    is_violation: bool,
    *,
    expires_at: datetime | None,
    at: datetime,
) -> bool:
    if not is_violation:
        return False
    if expires_at is not None and expires_at <= at:
        return False
    return True


async def _current_finding_for_subject(
    session: AsyncSession,
    *,
    policy_id: str,
    subject_key: str,
) -> ComplianceCurrentFinding | None:
    return await session.scalar(
        select(ComplianceCurrentFinding).where(
            ComplianceCurrentFinding.policy_id == policy_id,
            ComplianceCurrentFinding.subject_key == subject_key,
        )
    )


async def _current_findings_for_scope(
    session: AsyncSession,
    *,
    policy_id: str,
    scope_key: str,
) -> dict[str, ComplianceCurrentFinding]:
    findings = list(
        await session.scalars(
            select(ComplianceCurrentFinding).where(
                ComplianceCurrentFinding.policy_id == policy_id,
                ComplianceCurrentFinding.scope_key == scope_key,
            )
        )
    )
    return {finding.subject_key: finding for finding in findings}


async def _upsert_current_finding(
    session: AsyncSession,
    *,
    policy: CompliancePolicy,
    revision: CompliancePolicyRevision,
    evaluation: ComplianceEvaluation,
    entity: ObservedEntity,
    matched_rule_ids: list[str],
    evidence_json: dict[str, Any],
    is_violation: bool,
    observed_at: datetime,
    expires_at: datetime | None,
) -> None:
    finding = await _current_finding_for_subject(
        session,
        policy_id=policy.id,
        subject_key=entity.subject_key,
    )
    if finding is None:
        finding = ComplianceCurrentFinding(
            policy_id=policy.id,
            revision_id=revision.id,
            environment_id=policy.environment_id,
            latest_evaluation_id=evaluation.id,
            host_id=entity.host_id,
            entity_kind=policy.entity_kind,
            subject_key=entity.subject_key,
            subject_label=entity.subject_label,
            scope_key=entity.scope_key,
            matched_rule_ids_json=matched_rule_ids,
            evidence_json=evidence_json,
            observed_at=observed_at,
            expires_at=expires_at,
            is_violation=is_violation,
        )
        session.add(finding)
        return

    finding.revision_id = revision.id
    finding.latest_evaluation_id = evaluation.id
    finding.host_id = entity.host_id
    finding.subject_label = entity.subject_label
    finding.scope_key = entity.scope_key
    finding.matched_rule_ids_json = matched_rule_ids
    finding.evidence_json = evidence_json
    finding.observed_at = observed_at
    finding.expires_at = expires_at
    finding.is_violation = is_violation


async def _load_environment_hosts(
    session: AsyncSession,
    *,
    environment_id: str,
) -> list[Host]:
    return list(
        await session.scalars(
            select(Host).where(Host.environment_id == environment_id)
        )
    )


def _build_host_endpoint_index(hosts: list[Host]) -> dict[str, Host]:
    index: dict[str, Host] = {}
    for host in hosts:
        for alias in host_resolution_aliases(host):
            index.setdefault(alias, host)
    return index


def _stable_text_key(value: str) -> str:
    return hashlib.sha1(value.encode("utf-8")).hexdigest()[:12]
