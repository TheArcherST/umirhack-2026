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
