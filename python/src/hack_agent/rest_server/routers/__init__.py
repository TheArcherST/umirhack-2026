from fastapi import APIRouter

from . import (
    check,
    healthcheck,
)

router = APIRouter()


router.include_router(healthcheck.router)
router.include_router(check.router)
