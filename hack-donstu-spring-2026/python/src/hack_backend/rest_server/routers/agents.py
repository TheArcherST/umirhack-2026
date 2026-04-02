from dishka import FromDishka
from dishka.integrations.fastapi import inject
from fastapi import APIRouter, status

from hack_backend.core.models import Agent
from hack_backend.core.services.agent import AgentService
from hack_backend.core.services.uow_ctl import UoWCtl
from hack_backend.rest_server.schemas.agents import (
    CreateAgentDTO,
    MyAgentDTO,
    UpdateAgentDTO,
)

router = APIRouter(
    prefix="/agents",
)


@router.post(
    "",
    response_model=MyAgentDTO,
    status_code=status.HTTP_201_CREATED,
)
@inject
async def create_agent(
    agent_service: FromDishka[AgentService],
    uow_ctl: FromDishka[UoWCtl],
    payload: CreateAgentDTO,
) -> Agent:
    keypair = await agent_service.issue_keypair()
    agent = await agent_service.create_agent(
        name=payload.name,
        keypair=keypair,
        ip=payload.ip,
        port=payload.port,
        rhost="agent",
        rport=8080,
    )
    await uow_ctl.commit()
    return agent


@router.put(
    "/{agent_id}",
    response_model=MyAgentDTO,
)
@inject
async def update_agent(
    agent_service: FromDishka[AgentService],
    uow_ctl: FromDishka[UoWCtl],
    agent_id: int,
    payload: UpdateAgentDTO,
):
    agent = await agent_service.update_agent(
        id_=agent_id,
        name=payload.name,
        ip=payload.ip,
        port=payload.port,
        is_suspended=payload.is_suspended,
    )
    await uow_ctl.commit()
    return agent


@router.delete(
    "/{agent_id}",
)
@inject
async def delete_agent(
    agent_service: FromDishka[AgentService],
    uow_ctl: FromDishka[UoWCtl],
    agent_id: int,
) -> None:
    await agent_service.delete_agent(id_=agent_id)
    await uow_ctl.commit()
    return None


@router.get(
    "",
    response_model=list[MyAgentDTO],
)
@inject
async def get_my_agents(
    agent_service: FromDishka[AgentService],
) -> list[Agent]:
    agents = await agent_service.get_agents_with()
    agents = list(agents)
    return agents
