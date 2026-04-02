from urllib.parse import urlparse

import validators
from aiodns import DNSResolver
from aiodns.error import DNSError
from pydantic import BaseModel, IPvAnyAddress


class ResolvedEndpoint(BaseModel):
    domain: str | None
    ipv4: list[IPvAnyAddress]
    ipv6: list[IPvAnyAddress]

    @property
    def some_ip(self) -> IPvAnyAddress | None:
        if self.ipv4:
            return self.ipv4[0]
        if self.ipv6:
            return self.ipv6[0]
        return None


def flexible_parse(uri: str):
    if "://" not in uri:
        uri = "http://" + uri
    return urlparse(uri)


async def resolve_endpoint(endpoint: str) -> ResolvedEndpoint:
    uri = flexible_parse(endpoint)

    ipv4 = []
    ipv6 = []
    domain = None

    if validators.ipv4(uri.netloc):
        ipv4.append(uri.netloc)
    elif validators.ipv6(uri.netloc):
        ipv6.append(uri.netloc)
    else:
        domain = uri.netloc
        resolver = DNSResolver()
        try:
            ipv4.extend(i.host for i in await resolver.query(domain, "A"))
        except DNSError:
            pass
        try:
            ipv6.extend(i.host for i in await resolver.query(domain, "AAAA"))
        except DNSError:
            pass

    return ResolvedEndpoint.model_validate(
        {
            "domain": domain,
            "ipv4": ipv4,
            "ipv6": ipv6,
        }
    )
