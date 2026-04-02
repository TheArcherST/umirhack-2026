from typing import Literal, Optional

from pydantic import Field

from .base import BaseCheckTaskPayload, BaseCheckTaskResult
from .type_enum import CheckTaskTypeEnum


class TCPUDPCheckTaskPayload(BaseCheckTaskPayload):
    type: Literal[CheckTaskTypeEnum.TCP_AND_UDP] = (
        CheckTaskTypeEnum.TCP_AND_UDP
    )
    url: str
    timeout: int = 10
    verify_ssl: bool = True
    port: int = Field(..., ge=1, le=65535)
    protocol: str = Field("tcp", pattern="^(tcp|udp)$")
    timeout: int = 5


class TCPUDPCheckTaskResult(BaseCheckTaskResult):
    type: Literal[CheckTaskTypeEnum.TCP_AND_UDP] = (
        CheckTaskTypeEnum.TCP_AND_UDP
    )
    reachable: bool | None = None
    latency_ms: float | None = None
    protocol: str | None = None
    port: int | None = None
    ip: str | None = None
    error: Optional[str] = None
