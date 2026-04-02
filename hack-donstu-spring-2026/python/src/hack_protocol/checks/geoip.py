from typing import Literal

from pydantic import BaseModel, IPvAnyAddress

from .base import BaseCheckTaskPayload, BaseCheckTaskResult
from .type_enum import CheckTaskTypeEnum


class GeoIPCheckTaskPayload(BaseCheckTaskPayload):
    type: Literal[CheckTaskTypeEnum.GEOIP] = CheckTaskTypeEnum.GEOIP
    url: str
    db_asn_path: str = "/usr/src/app/GeoLite2-ASN.mmdb"
    db_path: str = "/usr/src/app/GeoLite2-City.mmdb"


class GeoIPItem(BaseModel):
    ip: IPvAnyAddress
    country: str | None = None
    city: str | None = None
    region: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    time_zone: str | None = None
    organization: str | None = None
    error: str | None = None
    postal_code: int | None = None


class GeoIPCheckTaskResult(BaseCheckTaskResult):
    type: Literal[CheckTaskTypeEnum.GEOIP] = CheckTaskTypeEnum.GEOIP
    items: list[GeoIPItem]
