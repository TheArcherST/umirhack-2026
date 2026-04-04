from __future__ import annotations

import re
import tomllib
from pathlib import Path

from fastapi import HTTPException

from hack_backend.core.models import Agent
from hack_backend.core.providers import ConfigServer

SEMVER_PATTERN = re.compile(
    r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"
    r"(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?"
    r"(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$"
)
FALLBACK_AGENT_VERSION = "0.1.0"


class AgentVersioningService:
    def __init__(self, config: ConfigServer):
        self.config = config

    def current_release_version(self) -> str:
        configured = (self.config.agent_current_version or "").strip()
        if configured:
            return self.validate_semver(
                configured,
                field_name="server.agent_current_version",
            )

        manifest_version = self._manifest_version()
        if manifest_version is not None:
            return manifest_version

        cargo_version = self._cargo_package_version()
        if cargo_version is not None:
            return cargo_version

        return FALLBACK_AGENT_VERSION

    def normalize_agent_version(self, agent: Agent) -> str:
        stored = self._normalize_stored_semver(agent.agent_version)
        if stored is not None:
            return stored
        return self.current_release_version()

    def normalize_reported_version(self, version: str | None) -> str | None:
        if version is None:
            return None
        normalized = version.strip()
        if not normalized:
            return None
        return self.validate_semver(
            normalized,
            field_name="reported_agent_version",
        )

    def validate_semver(self, version: str, *, field_name: str) -> str:
        normalized = version.strip()
        if not SEMVER_PATTERN.fullmatch(normalized):
            raise HTTPException(
                status_code=400,
                detail=f"{field_name} must be a valid SemVer string",
            )
        return normalized

    def resolve_agent_target_version(self, requested_version: str | None) -> str:
        if requested_version is None:
            return self.current_release_version()
        return self.validate_semver(requested_version, field_name="agent_version")

    def resolve_self_update_versions(
        self,
        *,
        agent: Agent,
        requested_version: str | None,
        artifact_url: str | None,
    ) -> tuple[str, str]:
        current_version = self._normalize_stored_semver(agent.reported_agent_version)
        from_version = current_version or self.normalize_agent_version(agent)
        target_version = (
            self.resolve_agent_target_version(requested_version)
            if requested_version is not None
            else self.normalize_agent_version(agent)
        )
        if artifact_url is None:
            self.ensure_artifact_version_available(target_version)
        return from_version, target_version

    def ensure_artifact_version_available(self, version: str) -> None:
        normalized = self.validate_semver(version, field_name="agent_version")
        if self.resolve_artifact_version_dir(normalized) is None:
            raise HTTPException(
                status_code=409,
                detail=f"Agent artifacts for version {normalized} are not published",
            )

    def resolve_artifact_version_dir(self, version: str) -> Path | None:
        normalized = self.validate_semver(version, field_name="agent_version")
        base_dir = Path(self.config.agent_artifacts_dir).resolve()
        version_dir = (base_dir / normalized).resolve()
        if version_dir.is_dir() and version_dir.parent == base_dir:
            return version_dir
        return None

    def _normalize_stored_semver(self, version: str | None) -> str | None:
        if version is None:
            return None
        normalized = version.strip()
        if not normalized or not SEMVER_PATTERN.fullmatch(normalized):
            return None
        return normalized

    def _manifest_version(self) -> str | None:
        manifest_path = Path(self.config.agent_artifacts_dir) / "manifest.json"
        if not manifest_path.exists():
            return None
        try:
            import json

            payload = json.loads(manifest_path.read_text())
        except (OSError, ValueError, TypeError):
            return None
        current_version = payload.get("current_version")
        if not isinstance(current_version, str):
            return None
        normalized = current_version.strip()
        if not normalized or not SEMVER_PATTERN.fullmatch(normalized):
            return None
        return normalized

    def _cargo_package_version(self) -> str | None:
        cargo_path = Path(__file__).resolve().parents[5] / "rust" / "hack_agent" / "Cargo.toml"
        if not cargo_path.exists():
            return None
        try:
            payload = tomllib.loads(cargo_path.read_text())
        except (OSError, tomllib.TOMLDecodeError):
            return None
        version = payload.get("package", {}).get("version")
        if not isinstance(version, str):
            return None
        normalized = version.strip()
        if not normalized or not SEMVER_PATTERN.fullmatch(normalized):
            return None
        return normalized
