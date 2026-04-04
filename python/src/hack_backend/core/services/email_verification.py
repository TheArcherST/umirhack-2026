from datetime import UTC, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from hack_backend.core.providers import ConfigEmail
from hack_backend.core.security import hash_secret, verify_secret
from hack_backend.core.models import User
from hack_backend.tasksd.email_tasks import send_verification_email_task
from hack_backend.utils.otp_utils import generate_otp_code, is_otp_code_format_valid


class EmailVerificationError(Exception):
    pass


class NoOtpSecret(EmailVerificationError):
    pass


class InvalidVerificationCode(EmailVerificationError):
    pass


class CodeExpired(EmailVerificationError):
    pass


class ResendTooSoon(EmailVerificationError):
    pass


class TooManyVerificationAttempts(EmailVerificationError):
    pass


class EmailAlreadyVerified(EmailVerificationError):
    pass


class EmailVerificationService:
    def __init__(
        self,
        orm_session: AsyncSession,
        email_config: ConfigEmail,
    ):
        self.orm_session = orm_session
        self.email_config = email_config

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

        now = self._utcnow()
        resend_available_at = self._normalize_timestamp(
            user.email_verification_resend_available_at
        )
        if resend_available_at is not None and resend_available_at > now:
            raise ResendTooSoon("Verification code was sent too recently")

        code = generate_otp_code(self.email_config.code_length)
        user.email_verification_code_hash = hash_secret(code)
        user.email_verification_sent_at = now
        user.email_verification_expires_at = now + timedelta(
            minutes=self.email_config.code_validity_minutes
        )
        user.email_verification_resend_available_at = now + timedelta(
            seconds=self.email_config.resend_cooldown_seconds
        )
        user.email_verification_attempt_count = 0
        user.otp_secret = None

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

        if (
            not user.email_verification_code_hash
            or user.email_verification_expires_at is None
        ):
            raise NoOtpSecret("No verification code configured")

        now = self._utcnow()
        expires_at = self._normalize_timestamp(user.email_verification_expires_at)
        if expires_at is not None and expires_at <= now:
            self._clear_verification_state(user, preserve_resend_window=True)
            raise CodeExpired("Verification code expired")

        if not is_otp_code_format_valid(code, self.email_config.code_length):
            if self._register_failed_attempt(user, now):
                raise TooManyVerificationAttempts("Too many verification attempts")
            raise InvalidVerificationCode("Invalid code")

        is_valid = verify_secret(code, user.email_verification_code_hash)
        if not is_valid:
            if self._register_failed_attempt(user, now):
                raise TooManyVerificationAttempts("Too many verification attempts")
            raise InvalidVerificationCode("Invalid code")

        user.email_verified = True
        self._clear_verification_state(user)
        return True

    def _register_failed_attempt(self, user: User, now) -> bool:
        user.email_verification_attempt_count += 1
        if user.email_verification_attempt_count < self.email_config.max_verification_attempts:
            return False

        resend_available_at = self._normalize_timestamp(
            user.email_verification_resend_available_at
        )
        next_resend_at = now + timedelta(seconds=self.email_config.resend_cooldown_seconds)
        if resend_available_at is None or resend_available_at < next_resend_at:
            user.email_verification_resend_available_at = next_resend_at
        self._clear_verification_state(user, preserve_resend_window=True)
        return True

    def _clear_verification_state(
        self,
        user: User,
        *,
        preserve_resend_window: bool = False,
    ) -> None:
        user.otp_secret = None
        user.email_verification_code_hash = None
        user.email_verification_sent_at = None
        user.email_verification_expires_at = None
        user.email_verification_attempt_count = 0
        if not preserve_resend_window:
            user.email_verification_resend_available_at = None

    def _normalize_timestamp(self, value):
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)

    def _utcnow(self):
        from datetime import datetime

        return datetime.now(tz=UTC)
