from typing import Literal

from pydantic import IPvAnyAddress

from .base import BaseCheckTaskPayload, BaseCheckTaskResult
from .type_enum import CheckTaskTypeEnum


class PingCheckTaskPayload(BaseCheckTaskPayload):
    type: Literal[CheckTaskTypeEnum.PING] = CheckTaskTypeEnum.PING
    url: str
    count: int | None = 4


class PingCheckTaskResult(BaseCheckTaskResult):
    ip: IPvAnyAddress | None = None
    type: Literal[CheckTaskTypeEnum.PING] = CheckTaskTypeEnum.PING
    average_delay: float | None = None  # seconds
    max_delay: float | None = None
    min_delay: float | None = None
    live: int | None = None
    total: int | None = None
    success: bool = False
    error: str | None = None
