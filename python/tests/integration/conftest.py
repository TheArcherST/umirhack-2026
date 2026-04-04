from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse
from uuid import uuid4

import httpx
import pytest


def _unique_suffix() -> str:
    return uuid4().hex[:10]


@dataclass(slots=True)
class RegisteredUser:
    id: str
    username: str
    password: str
    token: str

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"}


@dataclass(slots=True)
class ProjectBundle:
    project: dict[str, Any]
    environment: dict[str, Any]
    templates: list[dict[str, Any]]


@dataclass(slots=True)
class AgentCredentials:
    agent_id: str
    registration_token: str

    @property
    def headers(self) -> dict[str, str]:
        return {
            "X-Agent-Id": self.agent_id,
            "X-Agent-Token": self.registration_token,
        }


class ApiDriver:
    def __init__(self, client: httpx.Client):
        self.client = client

    def register_user(self, *, prefix: str) -> RegisteredUser:
        username = f"{prefix}-{_unique_suffix()}"
        password = f"pw-{_unique_suffix()}"
        response = self.client.post(
            "/register",
            json={
                "username": username,
                "password": password,
            },
            headers={"User-Agent": "pytest-integration"},
        )
        assert response.status_code == 201, response.text
        payload = response.json()
        assert payload["auth"] is not None
        return RegisteredUser(
            id=payload["auth"]["user"]["id"],
            username=username,
            password=password,
            token=payload["auth"]["token"],
        )

    def login(self, *, username: str, password: str) -> httpx.Response:
        return self.client.post(
            "/login",
            json={"username": username, "password": password},
            headers={"User-Agent": "pytest-integration"},
        )

    def create_project_bundle(
        self,
        *,
        user: RegisteredUser,
        project_name: str,
    ) -> ProjectBundle:
        response = self.client.post(
            "/projects",
            json={"name": project_name},
            headers=user.headers,
        )
        assert response.status_code == 201, response.text
        project = response.json()

        environments = self.client.get(
            "/environments",
            params={"project_id": project["id"]},
            headers=user.headers,
        )
        assert environments.status_code == 200, environments.text
        environment_payload = environments.json()
        assert len(environment_payload) == 1

        templates = self.client.get(
            "/task-templates",
            params={"project_id": project["id"]},
            headers=user.headers,
        )
        assert templates.status_code == 200, templates.text
        return ProjectBundle(
            project=project,
            environment=environment_payload[0],
            templates=templates.json(),
        )

    def create_agent(
        self,
        *,
        user: RegisteredUser,
        project_id: str,
        environment_id: str,
        name: str,
        declared_os: str = "linux",
        safe_install: bool = False,
        max_concurrent_tasks: int = 4,
        agent_version: str | None = None,
    ) -> dict[str, Any]:
        response = self.client.post(
            "/agents",
            json={
                "project_id": project_id,
                "name": name,
                "declared_os": declared_os,
                "safe_install": safe_install,
                "max_concurrent_tasks": max_concurrent_tasks,
                "agent_version": agent_version,
                "environment_ids": [environment_id],
            },
            headers=user.headers,
        )
        assert response.status_code == 201, response.text
        return response.json()

    def get_install_script(
        self,
        *,
        user: RegisteredUser,
        agent_id: str,
    ) -> dict[str, Any]:
        response = self.client.get(
            f"/agents/{agent_id}/install-script",
            headers=user.headers,
        )
        assert response.status_code == 200, response.text
        return response.json()

    def issue_install_token(
        self,
        *,
        user: RegisteredUser,
        agent_id: str,
    ) -> str:
        script_url = self.get_install_script(
            user=user,
            agent_id=agent_id,
        )["script_url"]
        return urlparse(script_url).path.rstrip("/").split("/")[-1]

    def register_agent(
        self,
        *,
        bootstrap_token: str,
        declared_os: str = "linux",
        agent_version: str = "0.1.0",
    ) -> AgentCredentials:
        response = self.client.post(
            "/agent/register",
            json={
                "bootstrap_token": bootstrap_token,
                "agent_version": agent_version,
                "declared_os": declared_os,
                "capabilities_json": {
                    "task_kinds": [
                        "host.system_profile",
                        "host.ip_interfaces",
                        "network.endpoint_connectivity",
                    ]
                },
            },
        )
        assert response.status_code == 200, response.text
        payload = response.json()
        return AgentCredentials(
            agent_id=payload["agent_id"],
            registration_token=payload["registration_token"],
        )

    def poll_agent(
        self,
        *,
        agent: AgentCredentials,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        response = self.client.post(
            "/agent/poll",
            json={"limit": limit},
            headers=agent.headers,
        )
        assert response.status_code == 200, response.text
        return response.json()

    def heartbeat_agent(
        self,
        *,
        agent: AgentCredentials,
        agent_version: str = "0.1.0",
        capabilities_json: dict[str, Any] | None = None,
    ) -> None:
        response = self.client.post(
            "/agent/heartbeat",
            json={
                "agent_version": agent_version,
                "capabilities_json": capabilities_json
                or {
                    "task_kinds": [
                        "host.system_profile",
                        "host.ip_interfaces",
                        "network.endpoint_connectivity",
                    ]
                },
            },
            headers=agent.headers,
        )
        assert response.status_code == 200, response.text

    def mark_task_running(
        self,
        *,
        agent: AgentCredentials,
        task_run_id: str,
        lease_token: str,
    ) -> None:
        response = self.client.post(
            f"/agent/task-runs/{task_run_id}/running",
            json={"lease_token": lease_token},
            headers=agent.headers,
        )
        assert response.status_code == 200, response.text

    def complete_task(
        self,
        *,
        agent: AgentCredentials,
        task_run_id: str,
        payload: dict[str, Any],
    ) -> None:
        response = self.client.post(
            f"/agent/task-runs/{task_run_id}/complete",
            json=payload,
            headers=agent.headers,
        )
        assert response.status_code == 200, response.text


@pytest.fixture(scope="session")
def base_url() -> str:
    return os.environ.get("HACK_TEST_BASE_URL", "http://127.0.0.1:8000").rstrip("/")


@pytest.fixture
def api(base_url: str) -> ApiDriver:
    with httpx.Client(base_url=base_url, timeout=30.0) as client:
        yield ApiDriver(client)
