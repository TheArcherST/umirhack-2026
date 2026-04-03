from . import api_templates


def test_streams(
    client,
    authed_client,
):
    req = api_templates.make_create_agent()
    req.json = {
        "name": "Hello world",
        "port": 52141,
        "ip": "127.0.0.1",
    }
    r = client.prepsend(req)
    assert r.status_code == 401
    r = authed_client.prepsend(req)
    assert r.status_code == 201
    assert "52141" in str(r.json())
    agent_id = r.json()["id"]

    req = api_templates.make_get_agents()
    r = authed_client.prepsend(req)
    assert r.status_code == 200

    req = api_templates.make_delete_agent()
    req.path_params = {"agent_id": agent_id}
    r = authed_client.prepsend(req)
    assert r.status_code == 200
