from __future__ import annotations

import hashlib
import secrets

from argon2 import PasswordHasher

password_hasher = PasswordHasher()


def new_secret(length: int = 32) -> str:
    return secrets.token_urlsafe(length)


def hash_secret(raw_value: str) -> str:
    return hashlib.sha256(raw_value.encode("utf-8")).hexdigest()


def verify_secret(raw_value: str, expected_hash: str | None) -> bool:
    if not expected_hash:
        return False
    return secrets.compare_digest(hash_secret(raw_value), expected_hash)

