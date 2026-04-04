import pyotp

OTP_TTL = 300
OTP_DIGITS = 6


def generate_otp_secret() -> str:
    return pyotp.random_base32()


def generate_otp_code(otp_secret: str) -> str:
    totp = pyotp.TOTP(s=otp_secret, interval=OTP_TTL, digits=OTP_DIGITS)
    return totp.now()


def verify_otp_code(code: str, otp_secret: str) -> bool:
    totp = pyotp.TOTP(s=otp_secret, interval=OTP_TTL, digits=OTP_DIGITS)
    return totp.verify(code)
