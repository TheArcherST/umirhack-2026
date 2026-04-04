from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from hack_backend.core.models import User
from hack_backend.core.providers import ConfigEmail
from hack_backend.core.security import verify_secret
from hack_backend.core.services import email_verification as email_verification_module
from hack_backend.core.services.email_verification import (
    CodeExpired,
    EmailVerificationService,
    InvalidVerificationCode,
    ResendTooSoon,
    TooManyVerificationAttempts,
)
from hack_backend.utils import otp_utils


def make_user() -> User:
    return User(
        username="alice",
        email="alice@example.com",
        password_hash="hashed",
        email_verified=False,
    )


def make_service() -> EmailVerificationService:
    return EmailVerificationService(
        orm_session=None,  # type: ignore[arg-type]
        email_config=ConfigEmail(
            code_validity_minutes=5,
            code_length=6,
            resend_cooldown_seconds=60,
            max_verification_attempts=3,
        ),
    )


@pytest.mark.anyio
async def test_send_verification_code_sets_exact_length_and_hash(monkeypatch) -> None:
    service = make_service()
    user = make_user()
    issued_codes: list[str] = []

    async def fake_kiq(**kwargs) -> None:
        issued_codes.append(kwargs["code"])

    monkeypatch.setattr(
        email_verification_module.send_verification_email_task,
        "kiq",
        fake_kiq,
    )
    monkeypatch.setattr(
        email_verification_module,
        "generate_otp_code",
        lambda length: "000042",
    )
    monkeypatch.setattr(
        service,
        "_utcnow",
        lambda: datetime(2026, 4, 4, 12, 0, tzinfo=UTC),
    )

    code = await service.send_verification_code(user)

    assert code == "000042"
    assert issued_codes == ["000042"]
    assert len(code) == service.email_config.code_length
    assert code.isdigit()
    assert verify_secret(code, user.email_verification_code_hash)
    assert user.email_verification_attempt_count == 0
    assert user.email_verification_expires_at == datetime(
        2026,
        4,
        4,
        12,
        5,
        tzinfo=UTC,
    )
    assert user.email_verification_resend_available_at == datetime(
        2026,
        4,
        4,
        12,
        1,
        tzinfo=UTC,
    )


@pytest.mark.anyio
async def test_resend_before_cooldown_is_rejected(monkeypatch) -> None:
    service = make_service()
    user = make_user()

    async def fake_kiq(**kwargs) -> None:
        return None

    monkeypatch.setattr(
        email_verification_module.send_verification_email_task,
        "kiq",
        fake_kiq,
    )
    monkeypatch.setattr(
        email_verification_module,
        "generate_otp_code",
        lambda length: "123456",
    )
    now = datetime(2026, 4, 4, 12, 0, tzinfo=UTC)
    monkeypatch.setattr(service, "_utcnow", lambda: now)

    await service.send_verification_code(user)

    with pytest.raises(ResendTooSoon):
        await service.send_verification_code(user)


@pytest.mark.anyio
async def test_resend_after_cooldown_rotates_code(monkeypatch) -> None:
    service = make_service()
    user = make_user()
    issued_codes: list[str] = []

    async def fake_kiq(**kwargs) -> None:
        issued_codes.append(kwargs["code"])

    code_iter = iter(["111111", "222222"])
    monkeypatch.setattr(
        email_verification_module.send_verification_email_task,
        "kiq",
        fake_kiq,
    )
    monkeypatch.setattr(
        email_verification_module,
        "generate_otp_code",
        lambda length: next(code_iter),
    )
    current_time = {"value": datetime(2026, 4, 4, 12, 0, tzinfo=UTC)}
    monkeypatch.setattr(service, "_utcnow", lambda: current_time["value"])

    first_code = await service.send_verification_code(user)
    first_hash = user.email_verification_code_hash
    current_time["value"] = current_time["value"] + timedelta(seconds=61)

    second_code = await service.send_verification_code(user)

    assert issued_codes == [first_code, second_code]
    assert first_code != second_code
    assert first_hash != user.email_verification_code_hash
    with pytest.raises(InvalidVerificationCode):
        service.verify_code(user, first_code)


@pytest.mark.anyio
async def test_expired_code_is_rejected_from_send_time(monkeypatch) -> None:
    service = make_service()
    user = make_user()

    async def fake_kiq(**kwargs) -> None:
        return None

    monkeypatch.setattr(
        email_verification_module.send_verification_email_task,
        "kiq",
        fake_kiq,
    )
    monkeypatch.setattr(
        email_verification_module,
        "generate_otp_code",
        lambda length: "123456",
    )
    current_time = {"value": datetime(2026, 4, 4, 12, 0, tzinfo=UTC)}
    monkeypatch.setattr(service, "_utcnow", lambda: current_time["value"])

    code = await service.send_verification_code(user)
    current_time["value"] = current_time["value"] + timedelta(minutes=5, seconds=1)

    with pytest.raises(CodeExpired):
        service.verify_code(user, code)


@pytest.mark.anyio
async def test_verification_attempts_are_limited(monkeypatch) -> None:
    service = make_service()
    user = make_user()

    async def fake_kiq(**kwargs) -> None:
        return None

    monkeypatch.setattr(
        email_verification_module.send_verification_email_task,
        "kiq",
        fake_kiq,
    )
    monkeypatch.setattr(
        email_verification_module,
        "generate_otp_code",
        lambda length: "123456",
    )
    monkeypatch.setattr(
        service,
        "_utcnow",
        lambda: datetime(2026, 4, 4, 12, 0, tzinfo=UTC),
    )

    await service.send_verification_code(user)

    with pytest.raises(InvalidVerificationCode):
        service.verify_code(user, "000000")
    with pytest.raises(InvalidVerificationCode):
        service.verify_code(user, "000000")
    with pytest.raises(TooManyVerificationAttempts):
        service.verify_code(user, "000000")

    assert user.email_verification_code_hash is None
    assert user.email_verification_attempt_count == 0


def test_generate_otp_code_respects_exact_length(monkeypatch) -> None:
    monkeypatch.setattr(otp_utils.secrets, "randbelow", lambda upper_bound: 42)

    code = otp_utils.generate_otp_code(6)

    assert code == "000042"
    assert otp_utils.is_otp_code_format_valid(code, 6)
    assert not otp_utils.is_otp_code_format_valid("42", 6)
    assert not otp_utils.is_otp_code_format_valid("00a042", 6)
