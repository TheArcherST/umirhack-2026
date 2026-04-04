from fastapi import APIRouter

router = APIRouter(
    prefix="/dev",
)


@router.get("/health")
async def dev_healthcheck() -> dict[str, str]:
    return {"message": "ok"}
