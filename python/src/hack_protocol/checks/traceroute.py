from typing import List, Literal

from pydantic import BaseModel

from .base import BaseCheckTaskPayload, BaseCheckTaskResult
from .type_enum import CheckTaskTypeEnum


class TracerouteHop(BaseModel):
    ttl: int | None = None
    ip: str | None = None
    rtt_ms: float | None = None
    city: str | None = None


class TracerouteCheckTaskPayload(BaseCheckTaskPayload):
    type: Literal[CheckTaskTypeEnum.TRACEROUTE] = CheckTaskTypeEnum.TRACEROUTE
    url: str
    max_hops: int = 30
    timeout: int = 2
    db_path: str = "/usr/src/app/GeoLite2-City.mmdb"


class TracerouteCheckTaskResult(BaseCheckTaskResult):
    type: Literal[CheckTaskTypeEnum.TRACEROUTE] = CheckTaskTypeEnum.TRACEROUTE

    destination: str
    destination_ip: str
    hops: List[TracerouteHop]
