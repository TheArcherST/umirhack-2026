from __future__ import annotations


def test_projects_require_bearer_auth(api) -> None:
    response = api.client.get("/projects")
    assert response.status_code == 401


def test_login_rejects_wrong_password(api) -> None:
    user = api.register_user(prefix="login")

    response = api.login(username=user.username, password="wrong-password")

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid username or password"


def test_login_returns_session_for_valid_credentials(api) -> None:
    user = api.register_user(prefix="login-ok")

    response = api.login(username=user.username, password=user.password)

    assert response.status_code == 201, response.text
    payload = response.json()
    assert payload["token"]
    assert payload["user"]["id"] == user.id
    assert payload["user"]["name"] == user.username


def test_unverified_email_login_is_blocked(api) -> None:
    username = "needs-verification"
    password = "pw-needs-verification"
    register = api.client.post(
        "/register",
        json={
            "username": username,
            "password": password,
            "email": "needs-verification@example.com",
        },
        headers={"User-Agent": "pytest-integration"},
    )
    assert register.status_code == 201, register.text
    payload = register.json()
    assert payload["email_verification_required"] is True
    assert payload["auth"] is None

    login = api.login(username=username, password=password)
    assert login.status_code == 403
    assert login.json()["detail"] == "Email is not verified"


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

    environment_members = api.client.get(
        f"/environments/{bundle.environment['id']}/members",
        headers=owner.headers,
    )
    assert environment_members.status_code == 200, environment_members.text
    assert environment_members.json() == [
        {
            "user_id": owner.id,
            "env_id": bundle.environment["id"],
            "role": "operator",
        }
    ]


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


def test_project_member_role_update_returns_updated_member(api) -> None:
    owner = api.register_user(prefix="owner")
    bundle = api.create_project_bundle(
        user=owner,
        project_name="Operations",
    )

    invited = api.client.post(
        f"/projects/{bundle.project['id']}/members/invite",
        json={"email": "invitee@example.com"},
        headers=owner.headers,
    )
    assert invited.status_code == 201, invited.text
    invited_payload = invited.json()
    assert invited_payload["role"] == "member"
    assert invited_payload["status"] == "pending"

    promoted = api.client.put(
        f"/projects/{bundle.project['id']}/members/{invited_payload['user_id']}/role",
        json={"role": "admin"},
        headers=owner.headers,
    )
    assert promoted.status_code == 200, promoted.text
    promoted_payload = promoted.json()
    assert promoted_payload["user_id"] == invited_payload["user_id"]
    assert promoted_payload["role"] == "admin"
    assert promoted_payload["status"] == "accepted"


def test_project_admin_is_operator_in_existing_and_new_environments(api) -> None:
    owner = api.register_user(prefix="owner")
    bundle = api.create_project_bundle(
        user=owner,
        project_name="Operations",
    )

    invited = api.client.post(
        f"/projects/{bundle.project['id']}/members/invite",
        json={"email": "project-admin@example.com"},
        headers=owner.headers,
    )
    assert invited.status_code == 201, invited.text
    invited_payload = invited.json()

    promoted = api.client.put(
        f"/projects/{bundle.project['id']}/members/{invited_payload['user_id']}/role",
        json={"role": "admin"},
        headers=owner.headers,
    )
    assert promoted.status_code == 200, promoted.text

    main_members_response = api.client.get(
        f"/environments/{bundle.environment['id']}/members",
        headers=owner.headers,
    )
    assert main_members_response.status_code == 200, main_members_response.text
    main_members = {
        member["user_id"]: member["role"]
        for member in main_members_response.json()
    }
    assert main_members[owner.id] == "operator"
    assert main_members[invited_payload["user_id"]] == "operator"

    created_environment = api.client.post(
        "/environments",
        json={"project_id": bundle.project["id"], "name": "staging"},
        headers=owner.headers,
    )
    assert created_environment.status_code == 201, created_environment.text
    environment = created_environment.json()

    new_members_response = api.client.get(
        f"/environments/{environment['id']}/members",
        headers=owner.headers,
    )
    assert new_members_response.status_code == 200, new_members_response.text
    new_members = {
        member["user_id"]: member["role"]
        for member in new_members_response.json()
    }
    assert new_members[owner.id] == "operator"
    assert new_members[invited_payload["user_id"]] == "operator"
