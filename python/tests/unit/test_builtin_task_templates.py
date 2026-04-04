from hack_backend.core.platform_ops import BOOTSTRAP_TEMPLATE_KINDS, BUILTIN_TEMPLATES


def test_builtin_templates_include_agent_self_update() -> None:
    kinds = {template["kind"] for template in BUILTIN_TEMPLATES}

    assert "agent.self_update" in kinds


def test_bootstrap_templates_include_service_status() -> None:
    assert "diagnostic.command.service_status" in BOOTSTRAP_TEMPLATE_KINDS
