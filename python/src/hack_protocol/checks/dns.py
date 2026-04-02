from typing import Literal

from .base import BaseCheckTaskPayload, BaseCheckTaskResult
from .type_enum import CheckTaskTypeEnum


class DNSCheckTaskPayload(BaseCheckTaskPayload):
    type: Literal[CheckTaskTypeEnum.DNS] = CheckTaskTypeEnum.DNS
    url: str


class DNSCheckTaskResult(BaseCheckTaskResult):
    type: Literal[CheckTaskTypeEnum.DNS] = CheckTaskTypeEnum.DNS

    a_records: list[str] | None = None
    aaaa_records: list[str] | None = None
    mx_records: list[str] | None = None
    ns_records: list[str] | None = None
    cname_records: list[str] | None = None
    txt_records: list[str] | None = None
