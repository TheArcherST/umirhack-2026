import secrets


def generate_otp_code(length: int) -> str:
    if length <= 0:
        raise ValueError("OTP length must be positive")
    upper_bound = 10**length
    return f"{secrets.randbelow(upper_bound):0{length}d}"


def is_otp_code_format_valid(code: str, length: int) -> bool:
    return len(code) == length and code.isdigit()
