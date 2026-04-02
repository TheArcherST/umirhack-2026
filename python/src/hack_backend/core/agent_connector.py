from contextlib import asynccontextmanager
from typing import AsyncGenerator

import asyncssh
import httpx


class AgentConnector:
    def __init__(
        self,
        host: str,
        port: int,
        rhost: str,
        rport: int,
        *,
        username: str | None = None,
        private_key_pem: str,
        passphrase: str | None = None,
    ):
        self.ssh_host = host
        self.ssh_port = port
        self.rhost = rhost
        self.rport = rport
        self.username = username
        self.key = asyncssh.import_private_key(
            private_key_pem, passphrase=passphrase
        )

    @asynccontextmanager
    async def connect(
        self, timeout: float = 10.0
    ) -> AsyncGenerator[httpx.AsyncClient, None]:
        async with asyncssh.connect(
            self.ssh_host,
            port=self.ssh_port,
            username=self.username,
            client_keys=[self.key],  # <- the in-memory key
            agent_path=None,  # don't use local ssh-agent
            agent_forwarding=False,  # not needed here
            password=None,  # enforce key-only
            known_hosts=None,  # consider pinning in production (see notes)
            connect_timeout=timeout,
            login_timeout=timeout,
        ) as conn:
            listener = await conn.forward_local_port(
                "127.0.0.1", 0, self.rhost, self.rport
            )
            local_port = listener.get_port()

            try:
                async with httpx.AsyncClient(
                    timeout=timeout,
                    base_url=f"http://127.0.0.1:{local_port}",
                ) as client:
                    yield client
            finally:
                listener.close()
                await listener.wait_closed()
