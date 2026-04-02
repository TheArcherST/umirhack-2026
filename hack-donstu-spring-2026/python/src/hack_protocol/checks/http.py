from typing import Any, Literal, Optional

from .base import BaseCheckTaskPayload, BaseCheckTaskResult
from .type_enum import CheckTaskTypeEnum


class HTTPCheckTaskPayload(BaseCheckTaskPayload):
    type: Literal[CheckTaskTypeEnum.HTTP] = CheckTaskTypeEnum.HTTP
    url: str
    timeout: int = 10
    verify_ssl: bool = False
    follow_redirects: bool = True
    method: str = "GET"
    headers: dict[str, str] | None = None
    body: Optional[str] = None


class HTTPCheckTaskResult(BaseCheckTaskResult):
    type: Literal[CheckTaskTypeEnum.HTTP] = CheckTaskTypeEnum.HTTP

    status_code: int | None = None
    reason: str | None = None
    headers: dict[str, Any] | None = None
    final_url: str | None = None
    content_snippet: str | None = None
    error: str | None = None
