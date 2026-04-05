from __future__ import annotations

from enum import StrEnum


class ProjectMemberRole(StrEnum):
    ADMIN = "admin"
    MEMBER = "member"


class InviteStatus(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"


class EnvironmentMemberRole(StrEnum):
    OPERATOR = "operator"
    OBSERVER = "observer"


class ComplianceMode(StrEnum):
    ALLOWLIST = "allowlist"
    BLACKLIST = "blacklist"


class ComplianceEventKind(StrEnum):
    RISE = "rise"
    RESOLVED = "resolved"


class ComplianceEventOrigin(StrEnum):
    LIVE = "live"
    BACKFILL = "backfill"


class AgentStatus(StrEnum):
    ONLINE = "online"
    OFFLINE = "offline"
    STALE = "stale"


class TaskRunStatus(StrEnum):
    QUEUED = "queued"
    LEASED = "leased"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"
    EXPIRED = "expired"
