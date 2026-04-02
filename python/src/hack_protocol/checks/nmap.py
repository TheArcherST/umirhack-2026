from typing import Any, Literal

from .base import BaseCheckTaskPayload, BaseCheckTaskResult
from .type_enum import CheckTaskTypeEnum


class Nmap3CheckTaskPayload(BaseCheckTaskPayload):
    type: Literal[CheckTaskTypeEnum.NMAP] = CheckTaskTypeEnum.NMAP
    url: str
    ports: str | None = None  # optional (for future use)


class Nmap3CheckTaskResult(BaseCheckTaskResult):
    type: Literal[CheckTaskTypeEnum.NMAP] = CheckTaskTypeEnum.NMAP

    os_detection: dict[str, Any] | None = None
    version_detection: dict[str, Any] | None = None
    top_ports: dict[str, Any] | None = None
    error: str | None = None
