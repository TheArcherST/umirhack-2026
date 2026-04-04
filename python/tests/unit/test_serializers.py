from __future__ import annotations

from datetime import UTC, datetime

import pytest

from hack_backend.core.models import (
    Agent,
    AgentStatus,
    Environment,
    EnvironmentMember,
    EnvironmentMemberRole,
    Host,
    InviteStatus,
    ProjectMember,
    ProjectMemberRole,
    TaskRun,
    TaskRunStatus,
    TaskTemplate,
    User,
)
from hack_backend.rest_server.serializers import (
    agent_to_dto,
    environment_member_to_dto,
    project_member_to_dto,
    task_run_to_dto,
)


NOW = datetime(2026, 4, 4, 12, 0, tzinfo=UTC)


def make_user() -> User:
    return User(
        id=42,
        username="alice",
        email="alice@example.com",
        email_verified=True,
        password_hash="hashed",
        created_at=NOW,
    )


@pytest.mark.parametrize(
    ("role", "invite_status", "expected_role", "expected_status"),
    [
        (
            ProjectMemberRole.ADMIN,
            InviteStatus.ACCEPTED,
            "admin",
            "accepted",
        ),
        (
            ProjectMemberRole.MEMBER,
            InviteStatus.PENDING,
            "member",
            "pending",
        ),
        ("admin", "accepted", "admin", "accepted"),
        ("member", "pending", "member", "pending"),
    ],
)
def test_project_member_to_dto_accepts_enum_and_string_values(
    role,
    invite_status,
    expected_role: str,
    expected_status: str,
) -> None:
    dto = project_member_to_dto(
        ProjectMember(
            project_id="project-1",
            user_id=42,
            role=role,
            invite_status=invite_status,
            invited_at=NOW,
        ),
        make_user(),
    )

    assert dto.user_id == "42"
    assert dto.role == expected_role
    assert dto.status == expected_status


@pytest.mark.parametrize(
    ("role", "expected_role"),
    [
        (EnvironmentMemberRole.OPERATOR, "operator"),
        (EnvironmentMemberRole.OBSERVER, "observer"),
        ("operator", "operator"),
        ("observer", "observer"),
    ],
)
def test_environment_member_to_dto_accepts_enum_and_string_values(
    role,
    expected_role: str,
) -> None:
    dto = environment_member_to_dto(
        EnvironmentMember(
            environment_id="env-1",
            user_id=42,
            role=role,
            assigned_at=NOW,
        )
    )

    assert dto.user_id == "42"
    assert dto.role == expected_role


@pytest.mark.parametrize("status", [AgentStatus.ONLINE, "online"])
def test_agent_to_dto_accepts_enum_and_string_status(status) -> None:
    dto = agent_to_dto(
        Agent(
            id="agent-1",
            project_id="project-1",
            name="runner",
            status=status,
            created_at=NOW,
        ),
        [
            Environment(
                id="env-1",
                project_id="project-1",
                name="main",
                created_at=NOW,
            )
        ],
    )

    assert dto.status == "online"
    assert dto.environments[0].id == "env-1"


@pytest.mark.parametrize("status", [TaskRunStatus.RUNNING, "running"])
def test_task_run_to_dto_accepts_enum_and_string_status(status) -> None:
    task_run = TaskRun(
        id="task-run-1",
        environment_id="env-1",
        host_id="host-1",
        agent_id="agent-1",
        task_template_id="template-1",
        status=status,
        attempt_no=1,
        queued_at=NOW,
        task_template=TaskTemplate(
            id="template-1",
            project_id="project-1",
            kind="host.system_profile",
            name="System profile",
            created_at=NOW,
        ),
        host=Host(
            id="host-1",
            environment_id="env-1",
            agent_id="agent-1",
            name="node-1",
            internal_identifier="node-1",
            created_at=NOW,
        ),
        agent=Agent(
            id="agent-1",
            project_id="project-1",
            name="runner",
            status=AgentStatus.ONLINE,
            created_at=NOW,
        ),
    )

    dto = task_run_to_dto(task_run)

    assert dto.status == "running"
    assert dto.task_name == "System profile"
    assert dto.host_name == "node-1"
