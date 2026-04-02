from fastapi import APIRouter

from hack_agent.checks import perform_check as perform_agent_check
from hack_protocol.agent_api import PerformCheckDTO
from hack_protocol.checks.unions import AnyCheckTaskResultType

router = APIRouter()


@router.post(
    "/check",
    response_model=AnyCheckTaskResultType,
)
async def perform_check(
    payload: PerformCheckDTO,
):
    result = await perform_agent_check(payload.payload)
    return result
