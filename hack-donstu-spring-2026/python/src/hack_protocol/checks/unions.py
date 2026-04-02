from typing import Annotated

from pydantic import Discriminator, TypeAdapter

from .dns import DNSCheckTaskPayload, DNSCheckTaskResult
from .geoip import GeoIPCheckTaskPayload, GeoIPCheckTaskResult
from .http import HTTPCheckTaskPayload, HTTPCheckTaskResult
from .nmap import Nmap3CheckTaskPayload, Nmap3CheckTaskResult
from .ping import PingCheckTaskPayload, PingCheckTaskResult
from .tcp_and_udp import TCPUDPCheckTaskPayload, TCPUDPCheckTaskResult
from .traceroute import TracerouteCheckTaskPayload, TracerouteCheckTaskResult

type AnyCheckTaskPayloadType = Annotated[
    (
        DNSCheckTaskPayload
        | Nmap3CheckTaskPayload
        | HTTPCheckTaskPayload
        | GeoIPCheckTaskPayload
        | TCPUDPCheckTaskPayload
        | TracerouteCheckTaskPayload
        | PingCheckTaskPayload
    ),
    Discriminator("type"),
]
AnyCheckTaskPayload = TypeAdapter(AnyCheckTaskPayloadType)

type AnyCheckTaskResultType = Annotated[
    (
        DNSCheckTaskResult
        | Nmap3CheckTaskResult
        | HTTPCheckTaskResult
        | GeoIPCheckTaskResult
        | TCPUDPCheckTaskResult
        | TracerouteCheckTaskResult
        | PingCheckTaskResult
    ),
    Discriminator("type"),
]
AnyCheckTaskResult = TypeAdapter(AnyCheckTaskResultType)
