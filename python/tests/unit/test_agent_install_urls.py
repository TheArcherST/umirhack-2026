from __future__ import annotations

from hack_backend.core.providers import ConfigHack, ConfigPostgres, ConfigRedis, ConfigServer
from hack_backend.rest_server.routers.agents import _public_agent_url


def make_config(agent_public_origin: str | None) -> ConfigHack:
    return ConfigHack.model_construct(
        postgres=ConfigPostgres(
            host="postgres",
            port=5432,
            user="hack",
            password="changeme",
            database="hack",
        ),
        redis=ConfigRedis(
            host="redis",
            port=6379,
        ),
        server=ConfigServer(
            root_path="/api",
            agent_public_origin=agent_public_origin,
        ),
    )


def test_public_agent_url_keeps_original_url_when_origin_not_configured() -> None:
    url = "http://rest-server:80/api/agent-install/linux/token-1"

    assert _public_agent_url(url, config=make_config(None)) == url


def test_public_agent_url_rewrites_host_and_scheme_from_origin() -> None:
    url = "http://rest-server:80/api/agent-install/linux/token-1"

    assert (
        _public_agent_url(
            url,
            config=make_config("https://agents.example.com:8443"),
        )
        == "https://agents.example.com:8443/api/agent-install/linux/token-1"
    )


def test_public_agent_url_accepts_host_without_scheme() -> None:
    url = "http://rest-server:80/api/agent-install/linux/token-1"

    assert (
        _public_agent_url(
            url,
            config=make_config("agents.example.com"),
        )
        == "http://agents.example.com/api/agent-install/linux/token-1"
    )
