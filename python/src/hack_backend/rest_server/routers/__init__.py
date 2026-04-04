from fastapi import APIRouter

from . import (
    access,
    agents,
    checks,
    email_verification,
)

router = APIRouter()


router.include_router(access.router)
router.include_router(checks.router)
router.include_router(agents.router)
router.include_router(email_verification.router)


__all__ = [
    "router",
]
