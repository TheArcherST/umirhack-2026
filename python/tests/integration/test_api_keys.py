"""Integration tests for API keys CRUD and access control."""

from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from hack_backend.core.providers import ConfigHack


def _grant_project_membership(
    *,
    project_id: str,
    user_id: int,
    role: str = "member",
) -> None:
    """Directly insert a project membership row for test setup."""
    config = ConfigHack()
    engine = create_engine(
        config.postgres.get_sqlalchemy_url("psycopg", is_test_database=True)
    )
    try:
        with Session(engine) as session:
            from hack_backend.core.models import ProjectMember, ProjectMemberRole
            from hack_backend.core.models.enums import InviteStatus

            existing = session.get(
                ProjectMember,
                {"project_id": project_id, "user_id": user_id},
            )
            if existing is None:
                membership = ProjectMember(
                    project_id=project_id,
                    user_id=user_id,
                    role=ProjectMemberRole.MEMBER,
                    invite_status=InviteStatus.ACCEPTED,
                )
                session.add(membership)
                session.commit()
    finally:
        engine.dispose()


def test_create_api_key_returns_raw_key_once(api) -> None:
    """Creating an API key returns the raw key exactly once."""
    owner = api.register_user(prefix="keyowner")
    bundle = api.create_project_bundle(user=owner, project_name="KeyTest")
    env_id = bundle.environment["id"]

    response = api.client.post(
        f"/environments/{env_id}/api-keys",
        json={"name": "ci-pipeline", "role": "operator", "expiry": "7d"},
        headers=owner.headers,
    )
    assert response.status_code == 200, response.text
    payload = response.json()

    assert payload["name"] == "ci-pipeline"
    assert payload["role"] == "operator"
    assert payload["environment_id"] == env_id
    assert "key" in payload and len(payload["key"]) > 30
    assert payload["expires_at"] is not None
    assert payload["id"] is not None


def test_list_api_keys_shows_all_keys(api) -> None:
    """Listing API keys returns all keys for the environment."""
    owner = api.register_user(prefix="keyowner2")
    bundle = api.create_project_bundle(user=owner, project_name="KeyListTest")
    env_id = bundle.environment["id"]

    # Create two keys
    api.client.post(
        f"/environments/{env_id}/api-keys",
        json={"name": "key-one", "role": "operator", "expiry": "7d"},
        headers=owner.headers,
    )
    api.client.post(
        f"/environments/{env_id}/api-keys",
        json={"name": "key-two", "role": "observer", "expiry": "30d"},
        headers=owner.headers,
    )

    response = api.client.get(
        f"/environments/{env_id}/api-keys",
        headers=owner.headers,
    )
    assert response.status_code == 200, response.text
    keys = response.json()["keys"]
    assert len(keys) == 2
    names = {k["name"] for k in keys}
    assert "key-one" in names
    assert "key-two" in names


def test_revoke_api_key_marks_it_inactive(api) -> None:
    """Revoking an API key marks it as revoked and is_active becomes False."""
    owner = api.register_user(prefix="keyowner3")
    bundle = api.create_project_bundle(user=owner, project_name="KeyRevokeTest")
    env_id = bundle.environment["id"]

    create_resp = api.client.post(
        f"/environments/{env_id}/api-keys",
        json={"name": "to-revoke", "role": "operator", "expiry": "7d"},
        headers=owner.headers,
    )
    assert create_resp.status_code == 200, create_resp.text
    key_id = create_resp.json()["id"]

    # Revoke
    revoke_resp = api.client.post(
        f"/environments/{env_id}/api-keys/{key_id}/revoke",
        headers=owner.headers,
    )
    assert revoke_resp.status_code == 200, revoke_resp.text
    assert revoke_resp.json()["status"] == "revoked"

    # Verify key is now inactive
    list_resp = api.client.get(
        f"/environments/{env_id}/api-keys",
        headers=owner.headers,
    )
    assert list_resp.status_code == 200, list_resp.text
    keys = list_resp.json()["keys"]
    revoked_key = next(k for k in keys if k["id"] == key_id)
    assert revoked_key["is_active"] is False
    assert revoked_key["revoked_at"] is not None


def test_delete_api_key_removes_it(api) -> None:
    """Deleting an API key removes it from the list."""
    owner = api.register_user(prefix="keyowner4")
    bundle = api.create_project_bundle(user=owner, project_name="KeyDeleteTest")
    env_id = bundle.environment["id"]

    create_resp = api.client.post(
        f"/environments/{env_id}/api-keys",
        json={"name": "to-delete", "role": "operator", "expiry": "7d"},
        headers=owner.headers,
    )
    assert create_resp.status_code == 200, create_resp.text
    key_id = create_resp.json()["id"]

    # Delete
    delete_resp = api.client.delete(
        f"/environments/{env_id}/api-keys/{key_id}",
        headers=owner.headers,
    )
    assert delete_resp.status_code == 200, delete_resp.text
    assert delete_resp.json()["status"] == "deleted"

    # Verify key is gone
    list_resp = api.client.get(
        f"/environments/{env_id}/api-keys",
        headers=owner.headers,
    )
    assert list_resp.status_code == 200, list_resp.text
    keys = list_resp.json()["keys"]
    assert all(k["id"] != key_id for k in keys)


def test_api_key_requires_project_membership(api) -> None:
    """A user who is not a project member cannot create API keys for that environment."""
    owner = api.register_user(prefix="keyowner5")
    stranger = api.register_user(prefix="stranger5")
    bundle = api.create_project_bundle(user=owner, project_name="KeyAccessTest")
    env_id = bundle.environment["id"]

    response = api.client.post(
        f"/environments/{env_id}/api-keys",
        json={"name": "unauthorized", "role": "operator", "expiry": "7d"},
        headers=stranger.headers,
    )
    assert response.status_code == 403, response.text


def test_api_key_permanent_expiry_is_allowed(api) -> None:
    """Creating a key with expiry='never' sets expires_at to null."""
    owner = api.register_user(prefix="keyowner6")
    bundle = api.create_project_bundle(user=owner, project_name="KeyPermanentTest")
    env_id = bundle.environment["id"]

    response = api.client.post(
        f"/environments/{env_id}/api-keys",
        json={"name": "permanent-key", "role": "observer", "expiry": "never"},
        headers=owner.headers,
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["expires_at"] is None


def test_api_key_invalid_expiry_is_rejected(api) -> None:
    """Creating a key with an invalid expiry value returns 400."""
    owner = api.register_user(prefix="keyowner7")
    bundle = api.create_project_bundle(user=owner, project_name="KeyInvalidTest")
    env_id = bundle.environment["id"]

    response = api.client.post(
        f"/environments/{env_id}/api-keys",
        json={"name": "bad-expiry", "role": "operator", "expiry": "forever"},
        headers=owner.headers,
    )
    assert response.status_code == 400, response.text


def test_double_revoke_is_rejected(api) -> None:
    """Revoking an already revoked key returns 400."""
    owner = api.register_user(prefix="keyowner8")
    bundle = api.create_project_bundle(user=owner, project_name="KeyDoubleRevokeTest")
    env_id = bundle.environment["id"]

    create_resp = api.client.post(
        f"/environments/{env_id}/api-keys",
        json={"name": "double-revoke", "role": "operator", "expiry": "7d"},
        headers=owner.headers,
    )
    assert create_resp.status_code == 200, create_resp.text
    key_id = create_resp.json()["id"]

    # First revoke
    api.client.post(
        f"/environments/{env_id}/api-keys/{key_id}/revoke",
        headers=owner.headers,
    )

    # Second revoke should fail
    response = api.client.post(
        f"/environments/{env_id}/api-keys/{key_id}/revoke",
        headers=owner.headers,
    )
    assert response.status_code == 400, response.text


def test_revoke_key_from_wrong_environment_is_not_found(api) -> None:
    """Trying to revoke a key that belongs to a different environment returns 404."""
    owner = api.register_user(prefix="keyowner9")
    bundle1 = api.create_project_bundle(user=owner, project_name="KeyEnv1Test")
    bundle2 = api.create_project_bundle(user=owner, project_name="KeyEnv2Test")

    create_resp = api.client.post(
        f"/environments/{bundle1.environment['id']}/api-keys",
        json={"name": "wrong-env", "role": "operator", "expiry": "7d"},
        headers=owner.headers,
    )
    assert create_resp.status_code == 200, create_resp.text
    key_id = create_resp.json()["id"]

    # Try to revoke from wrong environment
    response = api.client.post(
        f"/environments/{bundle2.environment['id']}/api-keys/{key_id}/revoke",
        headers=owner.headers,
    )
    assert response.status_code == 404, response.text


def test_delete_key_from_wrong_environment_is_not_found(api) -> None:
    """Trying to delete a key that belongs to a different environment returns 404."""
    owner = api.register_user(prefix="keyowner10")
    bundle1 = api.create_project_bundle(user=owner, project_name="KeyEnv1DelTest")
    bundle2 = api.create_project_bundle(user=owner, project_name="KeyEnv2DelTest")

    create_resp = api.client.post(
        f"/environments/{bundle1.environment['id']}/api-keys",
        json={"name": "wrong-env-del", "role": "operator", "expiry": "7d"},
        headers=owner.headers,
    )
    assert create_resp.status_code == 200, create_resp.text
    key_id = create_resp.json()["id"]

    # Try to delete from wrong environment
    response = api.client.delete(
        f"/environments/{bundle2.environment['id']}/api-keys/{key_id}",
        headers=owner.headers,
    )
    assert response.status_code == 404, response.text
