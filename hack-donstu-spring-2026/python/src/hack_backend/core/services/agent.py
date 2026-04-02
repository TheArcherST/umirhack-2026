from typing import AsyncIterable, Iterable

import asyncssh
from pydantic import IPvAnyAddress
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from hack_backend.core.agent_connector import AgentConnector
from hack_backend.core.models import Agent
from hack_backend.core.models.agent import AgentStatus
from hack_backend.core.models.agent_keypair import AgentKeypair
from hack_backend.rest_server.providers import AuthorizedUser


class AgentService:
    def __init__(
        self,
        orm_session: AsyncSession,
        authorized_user: AuthorizedUser,
    ):
        self.orm_session = orm_session
        self.authorized_user = authorized_user

    async def heartbit_mark(
        self,
        agent_id: int,
        status: AgentStatus,
    ) -> None:
        stmt = (
            update(Agent)
            .where(Agent.id == agent_id)
            .values({Agent.status: status})
        )
        await self.orm_session.execute(stmt)

    async def issue_keypair(
        self,
        passphrase: str | None = None,
    ) -> AgentKeypair:
        algorithm = "ssh-ed25519"
        priv = asyncssh.generate_private_key(algorithm)

        pub_line = priv.export_public_key(format_name="openssh")
        pem = priv.export_private_key(passphrase=passphrase)

        rec = AgentKeypair(
            name=None,
            algorithm=algorithm,
            public_key_openssh=pub_line.decode("utf-8"),
            private_key_pem=pem.decode("utf-8"),
        )
        self.orm_session.add(rec)
        await self.orm_session.commit()
        await self.orm_session.refresh(rec)
        return rec

    async def get_keypair_with(
        self,
        public_key: str | None = None,
    ) -> AgentKeypair | None:
        stmt = select(AgentKeypair).where(
            AgentKeypair.public_key_openssh == public_key
        )
        return await self.orm_session.scalar(stmt)

    async def get_connector(self, agent_id: int) -> AgentConnector:
        agent = await self.orm_session.get(
            Agent,
            agent_id,
            options=(joinedload(Agent.keypair),),
        )
        return AgentConnector(
            host=agent.ip,
            port=agent.port,
            rhost=agent.rhost,
            rport=agent.rport,
            private_key_pem=agent.keypair.private_key_pem,
            username="appuser",
        )

    async def create_agent(
        self,
        keypair: AgentKeypair,
        name: str | None,
        ip: IPvAnyAddress,
        port: int,
        rhost: str,
        rport: int,
    ):
        agent = Agent(
            name=name,
            keypair=keypair,
            ip=str(ip),
            port=port,
            rhost=rhost,
            rport=rport,
            created_by_user=self.authorized_user,
        )
        self.orm_session.add(agent)
        await self.orm_session.flush()
        return agent

    async def update_agent(
        self,
        id_: int,
        name: str | None,
        ip: IPvAnyAddress,
        port: int,
        is_suspended: bool,
    ) -> Agent:
        agent = await self.orm_session.get(Agent, id_)
        agent.name = name
        agent.ip = str(ip)
        agent.port = port
        agent.is_suspended = is_suspended
        await self.orm_session.flush()
        return agent

    async def stream_up_ids(
        self,
        limit: int | None = None,
        random_order: bool = False,
        is_up: bool = True,
    ) -> AsyncIterable[int]:
        stmt = select(Agent.id)
        if is_up:
            stmt = stmt.where(Agent.status == AgentStatus.UP).where(
                Agent.is_suspended.is_(False)
            )
        if limit is not None:
            stmt = stmt.limit(limit)
        if random_order:
            stmt = stmt.order_by(func.random())
        return await self.orm_session.stream_scalars(stmt)

    async def get_agents_with(
        self,
        id_: int | None = None,
    ) -> Iterable[Agent]:
        stmt = select(Agent)
        if id_ is not None:
            stmt = stmt.where(Agent.id == id_)

        return await self.orm_session.scalars(stmt)

    async def delete_agent(
        self,
        id_: int,
    ) -> None:
        stmt = delete(Agent).where(Agent.id == id_)
        await self.orm_session.execute(stmt)
        return None
