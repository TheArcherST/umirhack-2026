from __future__ import annotations

from hack_backend.core.providers import ConfigHack, ConfigPostgres, ConfigRedis, ConfigServer
from hack_backend.rest_server.agent_install import artifact_relative_path, render_install_script
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


def test_artifact_relative_path_includes_version_directory() -> None:
    assert (
        artifact_relative_path(
            version="0.1.0",
            platform="linux",
            arch="amd64",
        ).as_posix()
        == "0.1.0/linux/amd64/hack-agent"
    )


def test_linux_install_script_prompts_before_replacing_existing_agent() -> None:
    script = render_install_script(
        platform="linux",
        api_url="https://api.example.com",
        bootstrap_token="token-1",
        artifact_root_url="https://downloads.example.com/linux",
        agent_version="1.2.3",
        safe_install=False,
    )

    assert "confirm_replace_if_needed" in script
    assert "This installer will replace it." in script
    assert "UMIRHACK_AGENT_REPLACE=1" in script


def test_macos_install_script_prompts_before_replacing_existing_agent() -> None:
    script = render_install_script(
        platform="macos",
        api_url="https://api.example.com",
        bootstrap_token="token-1",
        artifact_root_url="https://downloads.example.com/macos",
        agent_version="1.2.3",
        safe_install=False,
    )

    assert "confirm_replace_if_needed" in script
    assert "This installer will replace it." in script
    assert "UMIRHACK_AGENT_REPLACE=1" in script


def test_windows_install_script_prompts_before_replacing_existing_agent() -> None:
    script = render_install_script(
        platform="windows",
        api_url="https://api.example.com",
        bootstrap_token="token-1",
        artifact_root_url="https://downloads.example.com/windows",
        agent_version="1.2.3",
        safe_install=False,
    )

    assert "Confirm-ReplaceIfNeeded" in script
    assert "This installer will replace it." in script
    assert "UMIRHACK_AGENT_REPLACE" in script
