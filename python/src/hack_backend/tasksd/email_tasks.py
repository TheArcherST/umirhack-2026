from dishka import FromDishka
from dishka.integrations.taskiq import inject

from hack_backend.core.providers import ConfigEmail, ConfigServer
from hack_backend.core.services.email import (
    send_compliance_event_email,
    send_password_change_email,
    send_project_invitation_email,
    send_verification_email,
)
from hack_backend.tasksd.broker import broker


@broker.task(retry_on_error=True, max_retries=2)
@inject(patch_module=True)
async def send_verification_email_task(
    email_address: str,
    code: str,
    user_name: str,
    email_config: FromDishka[ConfigEmail],
    request_ip: str = "unknown",
    user_agent: str = "unknown",
) -> None:
    """Background task: send verification code via Resend template."""
    await send_verification_email(
        to_address=email_address,
        code=code,
        user_name=user_name,
        api_key=email_config.resend_api_key,
        from_address=email_config.from_address,
        template_name=email_config.template_name,
        app_name=email_config.app_name,
        request_ip=request_ip,
        user_agent=user_agent,
        code_validity_minutes=email_config.code_validity_minutes,
    )


@broker.task(retry_on_error=True, max_retries=2)
@inject(patch_module=True)
async def send_password_change_email_task(
    email_address: str,
    user_name: str,
    confirm_url: str,
    cancel_url: str,
    email_config: FromDishka[ConfigEmail],
    request_ip: str = "unknown",
) -> None:
    """Background task: send password change confirmation via Resend template."""
    await send_password_change_email(
        to_address=email_address,
        user_name=user_name,
        confirm_url=confirm_url,
        cancel_url=cancel_url,
        api_key=email_config.resend_api_key,
        from_address=email_config.from_address,
        template_name=email_config.password_change_template_name,
        app_name=email_config.app_name,
        validity_hours=email_config.password_change_validity_hours,
        request_ip=request_ip,
    )


@broker.task(retry_on_error=True, max_retries=2)
@inject(patch_module=True)
async def send_project_invitation_email_task(
    email_address: str,
    user_name: str,
    project_name: str,
    invited_by: str,
    accept_url: str,
    decline_url: str,
    email_config: FromDishka[ConfigEmail],
) -> None:
    """Background task: send project invitation email via Resend template."""
    await send_project_invitation_email(
        to_address=email_address,
        user_name=user_name,
        project_name=project_name,
        invited_by=invited_by,
        accept_url=accept_url,
        decline_url=decline_url,
        api_key=email_config.resend_api_key,
        from_address=email_config.from_address,
        template_name=email_config.invite_template_name,
        app_name=email_config.app_name,
        invite_validity_hours=email_config.invite_validity_hours,
    )


@broker.task(retry_on_error=True, max_retries=2)
@inject(patch_module=True)
async def send_compliance_event_email_task(
    email_address: str,
    user_name: str,
    environment_name: str,
    environment_id: str,
    policy_name: str,
    event_kind: str,
    event_origin: str,
    subject_label: str,
    happened_at: str,
    matched_rule_labels: list[str],
    email_config: FromDishka[ConfigEmail],
    server_config: FromDishka[ConfigServer],
) -> None:
    """Background task: send compliance event notification email."""
    frontend_url = server_config.frontend_url.rstrip("/")
    compliance_url = (
        f"{frontend_url}/environments/{environment_id}/compliance"
        if frontend_url
        else ""
    )
    await send_compliance_event_email(
        to_address=email_address,
        user_name=user_name,
        environment_name=environment_name,
        policy_name=policy_name,
        event_kind=event_kind,
        event_origin=event_origin,
        subject_label=subject_label,
        happened_at=happened_at,
        matched_rule_labels=matched_rule_labels,
        api_key=email_config.resend_api_key,
        from_address=email_config.from_address,
        compliance_url=compliance_url,
        app_name=email_config.app_name,
    )
