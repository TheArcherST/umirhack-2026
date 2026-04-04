from dishka import FromDishka
from dishka.integrations.taskiq import inject

from hack_backend.core.providers import ConfigEmail
from hack_backend.core.services.email import send_verification_email
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
