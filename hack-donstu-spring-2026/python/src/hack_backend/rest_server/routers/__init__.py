from fastapi import APIRouter

from . import (
    access,
    agents,
    checks,
)

router = APIRouter()


router.include_router(access.router)
router.include_router(checks.router)
router.include_router(agents.router)


__all__ = [
    "router",
]
