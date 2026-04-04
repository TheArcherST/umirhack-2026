from sqlalchemy.ext.asyncio import AsyncSession

from hack_backend.core.models import User
from hack_backend.tasksd.email_tasks import send_verification_email_task
from hack_backend.utils.otp_utils import generate_otp_code, generate_otp_secret, verify_otp_code


class EmailVerificationError(Exception):
    pass


class NoOtpSecret(EmailVerificationError):
    pass


class InvalidVerificationCode(EmailVerificationError):
    pass


class CodeExpired(EmailVerificationError):
    pass


class EmailAlreadyVerified(EmailVerificationError):
    pass


class EmailVerificationService:
    def __init__(
        self,
        orm_session: AsyncSession,
    ):
        self.orm_session = orm_session

    async def send_verification_code(
        self,
        user: User,
        request_ip: str = "unknown",
        user_agent: str = "unknown",
    ) -> str:
        if user.email_verified:
            raise EmailAlreadyVerified("Email already verified")

        if not user.email:
            raise EmailVerificationError("User has no email")

        if user.otp_secret is None:
            user.otp_secret = generate_otp_secret()

        code = generate_otp_code(user.otp_secret)

        await send_verification_email_task.kiq(
            email_address=user.email,
            code=code,
            user_name=user.username,
            request_ip=request_ip,
            user_agent=user_agent,
        )

        return code

    def verify_code(self, user: User, code: str) -> bool:
        if user.email_verified:
            raise EmailAlreadyVerified("Email already verified")

        if not user.otp_secret:
            raise NoOtpSecret("No OTP secret configured")

        is_valid = verify_otp_code(code, user.otp_secret)
        if not is_valid:
            raise InvalidVerificationCode("Invalid code")

        user.email_verified = True
        return True
