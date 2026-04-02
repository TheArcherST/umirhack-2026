from datetime import datetime

from pydantic import IPvAnyAddress, computed_field

from hack_backend.core.models.agent import AgentStatus
from hack_protocol.base import BaseDTO


class CreateAgentDTO(BaseDTO):
    name: str
    ip: IPvAnyAddress
    port: int


class UpdateAgentDTO(BaseDTO):
    name: str
    ip: IPvAnyAddress
    port: int
    is_suspended: bool


class MyKeypairDTO(BaseDTO):
    public_key_openssh: str


class MyAgentDTO(BaseDTO):
    id: int
    name: str
    ip: IPvAnyAddress
    port: int
    status: AgentStatus
    is_suspended: bool
    created_at: datetime
    keypair: MyKeypairDTO

    @computed_field(return_type=str)
    def compose_file(
        self,
    ):
        return """\
services:
  agent:
    build: https://github.com/TheArcherST/hack.git#main:python
    command: run-agent-rest-server
    container_name: lvalue-agent
    restart: unless-stopped
  sshd:
    build: https://github.com/TheArcherST/hack.git#main:sshd
    container_name: lvalue-sshd
    environment:
      PUBLIC_KEY: "{public_key}"
    ports:
      - "{ssh_port}:22"  # publish SSH only, agent HTTP endpoint is not published
    depends_on:
      - agent
    restart: unless-stopped\
""".format(public_key=self.keypair.public_key_openssh, ssh_port=self.port)
