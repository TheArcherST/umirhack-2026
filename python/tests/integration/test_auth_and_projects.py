from __future__ import annotations


def test_projects_require_bearer_auth(api) -> None:
    response = api.client.get("/projects")
    assert response.status_code == 401


def test_login_rejects_wrong_password(api) -> None:
    user = api.register_user(prefix="login")

    response = api.login(username=user.username, password="wrong-password")

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid username or password"


def test_project_creation_bootstraps_main_environment_and_templates(api) -> None:
    owner = api.register_user(prefix="owner")

    bundle = api.create_project_bundle(
        user=owner,
        project_name="Operations",
    )

    assert bundle.project["name"] == "Operations"
    assert bundle.environment["name"] == "main"
    assert bundle.environment["project_id"] == bundle.project["id"]

    template_kinds = {template["kind"] for template in bundle.templates}
    assert template_kinds == {
        "host.system_profile",
        "host.ip_interfaces",
        "network.endpoint_connectivity",
        "diagnostic.command.port_scan",
        "diagnostic.command.disk_usage",
        "diagnostic.command.memory_cpu",
        "diagnostic.command.service_status",
        "diagnostic.command.system_logs",
    }

    members_response = api.client.get(
        f"/projects/{bundle.project['id']}/members",
        headers=owner.headers,
    )
    assert members_response.status_code == 200, members_response.text
    members = members_response.json()
    assert len(members) == 1
    assert members[0]["user_id"] == owner.id
    assert members[0]["role"] == "admin"
    assert members[0]["status"] == "accepted"


def test_project_data_is_isolated_from_other_users(api) -> None:
    owner = api.register_user(prefix="owner")
    stranger = api.register_user(prefix="stranger")
    bundle = api.create_project_bundle(
        user=owner,
        project_name="Restricted",
    )

    project_members = api.client.get(
        f"/projects/{bundle.project['id']}/members",
        headers=stranger.headers,
    )
    assert project_members.status_code == 403
    assert project_members.json()["detail"] == "Project access denied"

    environments = api.client.get(
        "/environments",
        params={"project_id": bundle.project["id"]},
        headers=stranger.headers,
    )
    assert environments.status_code == 403
    assert environments.json()["detail"] == "Project access denied"
