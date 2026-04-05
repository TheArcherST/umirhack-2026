import logging
from datetime import datetime

import resend

logger = logging.getLogger(__name__)


async def send_verification_email(
    to_address: str,
    code: str,
    user_name: str,
    api_key: str,
    from_address: str,
    template_name: str,
    app_name: str = "Linkoo",
    code_validity_minutes: int = 5,
    request_ip: str = "unknown",
    user_agent: str = "unknown",
) -> None:
    """Send a verification code email using Resend template."""
    resend.api_key = api_key

    r = resend.Emails.send({
        "from": from_address,
        "to": [to_address],
        "template": {
            "id": template_name,
            "variables": {
                "app_name": app_name,
                "code_validity_minutes": int(code_validity_minutes),
                "request_ip": request_ip,
                "request_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "user_agent": user_agent,
                "user_name": user_name,
                "verification_code": code,
            },
        },
    })

    logger.info("Verification email sent to %s, id: %s", to_address, r["id"])


async def send_password_change_email(
    to_address: str,
    user_name: str,
    confirm_url: str,
    cancel_url: str,
    api_key: str,
    from_address: str,
    template_name: str,
    app_name: str = "Linkoo",
    validity_hours: int = 1,
    request_ip: str = "unknown",
    request_time: str | None = None,
) -> None:
    """Send a password change confirmation email using Resend template."""
    resend.api_key = api_key

    r = resend.Emails.send({
        "from": from_address,
        "to": [to_address],
        "template": {
            "id": template_name,
            "variables": {
                "app_name": app_name,
                "user_name": user_name,
                "confirm_url": confirm_url,
                "cancel_url": cancel_url,
                "validity_hours": validity_hours,
                "request_ip": request_ip,
                "request_time": request_time or datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            },
        },
    })

    logger.info("Password change email sent to %s, id: %s", to_address, r["id"])


async def send_project_invitation_email(
    to_address: str,
    user_name: str,
    project_name: str,
    invited_by: str,
    accept_url: str,
    decline_url: str,
    api_key: str,
    from_address: str,
    template_name: str,
    app_name: str = "Linkoo",
    invite_validity_hours: int = 48,
) -> None:
    """Send a project invitation email using Resend template."""
    resend.api_key = api_key

    r = resend.Emails.send({
        "from": from_address,
        "to": [to_address],
        "template": {
            "id": template_name,
            "variables": {
                "app_name": app_name,
                "user_name": user_name,
                "project_name": project_name,
                "invited_by": invited_by,
                "accept_url": accept_url,
                "decline_url": decline_url,
                "invite_validity_hours": invite_validity_hours,
            },
        },
    })

    logger.info("Project invitation email sent to %s, id: %s", to_address, r["id"])


async def send_compliance_event_email(
    to_address: str,
    user_name: str,
    environment_name: str,
    policy_name: str,
    event_kind: str,
    event_origin: str,
    subject_label: str,
    happened_at: str,
    matched_rule_labels: list[str],
    api_key: str,
    from_address: str,
    template_name: str,
    compliance_url: str = "",
    app_name: str = "Linkoo",
) -> None:
    """Send a compliance event notification email."""
    resend.api_key = api_key

    event_title = "Нарушение обнаружено" if event_kind == "rise" else "Нарушение устранено"
    event_color = "#dc2626" if event_kind == "rise" else "#16a34a"
    event_bg_color = "#fef2f2" if event_kind == "rise" else "#f0fdf4"
    rules_text = ", ".join(matched_rule_labels) if matched_rule_labels else "—"

    r = resend.Emails.send({
        "from": from_address,
        "to": [to_address],
        "template": {
            "id": template_name,
            "variables": {
                "app_name": app_name,
                "user_name": user_name,
                "environment_name": environment_name,
                "policy_name": policy_name,
                "event_title": event_title,
                "event_color": event_color,
                "event_bg_color": event_bg_color,
                "subject_label": subject_label,
                "event_origin": event_origin,
                "happened_at": happened_at,
                "matched_rules": rules_text,
                "compliance_url": compliance_url,
            },
        },
    })

    logger.info("Compliance event email sent to %s, id: %s", to_address, r["id"])
