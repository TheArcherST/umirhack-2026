import asyncio
import socket
import time
from typing import Any

import aiohttp
import geoip2.database
import nmap3
from aiodns import DNSResolver
from aiodns.error import DNSError
from geoip2.errors import AddressNotFoundError
from ping3 import ping

from hack_agent.checks.commands import flexible_parse, resolve_endpoint
from hack_protocol.checks.dns import DNSCheckTaskPayload, DNSCheckTaskResult
from hack_protocol.checks.geoip import (
    GeoIPCheckTaskPayload,
    GeoIPCheckTaskResult,
    GeoIPItem,
)
from hack_protocol.checks.http import HTTPCheckTaskPayload, HTTPCheckTaskResult
from hack_protocol.checks.nmap import (
    Nmap3CheckTaskPayload,
    Nmap3CheckTaskResult,
)
from hack_protocol.checks.ping import PingCheckTaskPayload, PingCheckTaskResult
from hack_protocol.checks.tcp_and_udp import (
    TCPUDPCheckTaskPayload,
    TCPUDPCheckTaskResult,
)
from hack_protocol.checks.traceroute import (
    TracerouteCheckTaskPayload,
    TracerouteCheckTaskResult,
    TracerouteHop,
)
from hack_protocol.checks.unions import (
    AnyCheckTaskPayloadType,
    AnyCheckTaskResultType,
)


async def perform_check(
    payload: AnyCheckTaskPayloadType,
) -> AnyCheckTaskResultType:
    if isinstance(payload, DNSCheckTaskPayload):
        return await _perform_dns_check(payload)
    if isinstance(payload, GeoIPCheckTaskPayload):
        return await _perform_geoip_check(payload)
    if isinstance(payload, HTTPCheckTaskPayload):
        return await _perform_http_check(payload)
    if isinstance(payload, Nmap3CheckTaskPayload):
        return await _perform_nmap_check(payload)
    if isinstance(payload, PingCheckTaskPayload):
        return await _perform_ping_check(payload)
    if isinstance(payload, TCPUDPCheckTaskPayload):
        return await _perform_tcp_udp_check(payload)
    if isinstance(payload, TracerouteCheckTaskPayload):
        return await _perform_traceroute_check(payload)
    raise ValueError(f"Unsupported payload type: {type(payload)!r}")


async def _perform_dns_check(
    payload: DNSCheckTaskPayload,
) -> DNSCheckTaskResult:
    domain = flexible_parse(payload.url).netloc
    resolver = DNSResolver()

    async def query(record_type: str) -> list[str]:
        try:
            result = await resolver.query(domain, record_type)
        except DNSError:
            return []

        return [
            getattr(
                item,
                "host",
                str(item).removeprefix("<ares_query_txt_result> "),
            )
            for item in result
        ]

    (
        a_records,
        aaaa_records,
        mx_records,
        ns_records,
        txt_records,
        cname_records,
    ) = await asyncio.gather(
        query("A"),
        query("AAAA"),
        query("MX"),
        query("NS"),
        query("TXT"),
        query("CNAME"),
    )

    return DNSCheckTaskResult(
        a_records=a_records,
        aaaa_records=aaaa_records,
        mx_records=mx_records,
        ns_records=ns_records,
        txt_records=txt_records,
        cname_records=cname_records,
    )


async def _perform_geoip_check(
    payload: GeoIPCheckTaskPayload,
) -> GeoIPCheckTaskResult:
    resolved_endpoint = await resolve_endpoint(payload.url)
    items: list[GeoIPItem] = []

    with (
        geoip2.database.Reader(payload.db_asn_path) as asn_reader,
        geoip2.database.Reader(payload.db_path) as reader,
    ):
        for ip in resolved_endpoint.ipv4:
            asn_response = asn_reader.asn(str(ip))
            response = reader.city(str(ip))
            items.append(
                GeoIPItem(
                    ip=ip,
                    country=response.country.name,
                    city=response.city.name,
                    region=response.subdivisions.most_specific.name,
                    postal_code=response.postal.code,
                    latitude=response.location.latitude,
                    longitude=response.location.longitude,
                    time_zone=response.location.time_zone,
                    organization=asn_response.autonomous_system_organization,
                )
            )

    return GeoIPCheckTaskResult(items=items)


async def _perform_http_check(
    payload: HTTPCheckTaskPayload,
) -> HTTPCheckTaskResult:
    url = (
        payload.url
        if payload.url.startswith("http")
        else f"https://{payload.url}"
    )
    timeout = aiohttp.ClientTimeout(total=payload.timeout)

    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.request(
                method=payload.method,
                url=url,
                headers=payload.headers,
                data=payload.body,
                allow_redirects=payload.follow_redirects,
            ) as response:
                content = await response.text(errors="ignore")
                return HTTPCheckTaskResult(
                    status_code=response.status,
                    reason=response.reason,
                    headers=dict(response.headers),
                    final_url=str(response.url),
                    content_snippet=content[:500],
                )
    except Exception as exc:
        return HTTPCheckTaskResult(error=str(exc))


async def _perform_nmap_check(
    payload: Nmap3CheckTaskPayload,
) -> Nmap3CheckTaskResult:
    resolved_endpoint = await resolve_endpoint(payload.url)
    target = str(
        resolved_endpoint.domain or resolved_endpoint.some_ip or payload.url
    )
    nmap = nmap3.Nmap()

    async def run_version_detection() -> dict[str, Any]:
        return await asyncio.to_thread(nmap.nmap_version_detection, target)

    async def run_os_detection() -> dict[str, Any]:
        return await asyncio.to_thread(nmap.nmap_os_detection, target)

    async def run_top_ports() -> dict[str, Any]:
        return await asyncio.to_thread(nmap.scan_top_ports, target)

    try:
        version_detection, os_detection, top_ports = await asyncio.gather(
            run_version_detection(),
            run_os_detection(),
            run_top_ports(),
        )
    except Exception as exc:
        return Nmap3CheckTaskResult(error=str(exc))

    return Nmap3CheckTaskResult(
        version_detection=version_detection,
        os_detection=os_detection,
        top_ports=top_ports,
    )


async def _perform_ping_check(
    payload: PingCheckTaskPayload,
) -> PingCheckTaskResult:
    try:
        resolved_endpoint = await resolve_endpoint(payload.url)
        ping_result = [
            await asyncio.to_thread(
                ping,
                str(resolved_endpoint.some_ip),
                timeout=10,
            )
            for _ in range(payload.count or 0)
        ]
        alive_pings = [result for result in ping_result if result]
        ping_average = sum(alive_pings) / len(alive_pings)
        return PingCheckTaskResult(
            ip=resolved_endpoint.some_ip,
            average_delay=ping_average * 100,
            max_delay=max(alive_pings) * 100,
            min_delay=min(alive_pings) * 100,
            live=len(alive_pings),
            total=len(ping_result),
        )
    except Exception as exc:
        return PingCheckTaskResult(success=False, error=str(exc))


async def _perform_tcp_udp_check(
    payload: TCPUDPCheckTaskPayload,
) -> TCPUDPCheckTaskResult:
    result = (
        await _check_tcp(payload)
        if payload.protocol.lower() == "tcp"
        else await _check_udp(payload)
    )

    if "error" in result:
        return TCPUDPCheckTaskResult(error=result["error"])

    return TCPUDPCheckTaskResult(**result)


async def _check_tcp(payload: TCPUDPCheckTaskPayload) -> dict[str, Any]:
    resolved_endpoint = await resolve_endpoint(payload.url)
    start = asyncio.get_event_loop().time()

    try:
        _, writer = await asyncio.wait_for(
            asyncio.open_connection(
                str(resolved_endpoint.some_ip), payload.port
            ),
            timeout=payload.timeout,
        )
        writer.close()
        await writer.wait_closed()
    except Exception as exc:
        return {"error": str(exc)}

    elapsed = (asyncio.get_event_loop().time() - start) * 1000
    return {
        "reachable": True,
        "latency_ms": round(elapsed, 2),
        "protocol": "tcp",
        "port": payload.port,
        "ip": str(resolved_endpoint.some_ip),
    }


async def _check_udp(payload: TCPUDPCheckTaskPayload) -> dict[str, Any]:
    resolved_endpoint = await resolve_endpoint(payload.url)
    start = asyncio.get_event_loop().time()

    try:
        loop = asyncio.get_event_loop()
        on_response = loop.create_future()

        transport, _ = await loop.create_datagram_endpoint(
            asyncio.DatagramProtocol,
            remote_addr=(str(resolved_endpoint.some_ip), payload.port),
        )
        transport.sendto(b"ping")

        try:
            await asyncio.wait_for(on_response, timeout=payload.timeout)
        except asyncio.TimeoutError:
            pass
        finally:
            transport.close()
    except Exception as exc:
        return {"error": str(exc)}

    elapsed = (asyncio.get_event_loop().time() - start) * 1000
    return {
        "reachable": True,
        "latency_ms": round(elapsed, 2),
        "protocol": "udp",
        "port": payload.port,
        "ip": str(resolved_endpoint.some_ip),
    }


async def _perform_traceroute_check(
    payload: TracerouteCheckTaskPayload,
) -> TracerouteCheckTaskResult:
    resolved_endpoint = await resolve_endpoint(payload.url)
    destination = resolved_endpoint.domain or str(resolved_endpoint.some_ip)
    destination_ip = (
        str(resolved_endpoint.some_ip)
        if resolved_endpoint.some_ip is not None
        else socket.gethostbyname(destination)
    )
    hops: list[TracerouteHop] = []

    async def trace_hop(ttl: int) -> TracerouteHop:
        recv_sock = socket.socket(
            socket.AF_INET, socket.SOCK_RAW, socket.IPPROTO_ICMP
        )
        send_sock = socket.socket(
            socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP
        )
        recv_sock.settimeout(payload.timeout)
        send_sock.setsockopt(socket.SOL_IP, socket.IP_TTL, ttl)

        recv_sock.bind(("", 33434))
        send_sock.sendto(b"", (destination, 33434))
        start_time = time.time()

        ip = None
        rtt_ms = None

        try:
            _, curr_addr = recv_sock.recvfrom(512)
            elapsed = (time.time() - start_time) * 1000
            ip = curr_addr[0]
            rtt_ms = round(elapsed, 2)
        except socket.timeout:
            pass
        finally:
            recv_sock.close()
            send_sock.close()

        return TracerouteHop(ttl=ttl, ip=ip, rtt_ms=rtt_ms)

    with geoip2.database.Reader(payload.db_path) as reader:
        for ttl in range(1, payload.max_hops + 1):
            hop = await trace_hop(ttl)
            city = None
            if hop.ip:
                try:
                    city = reader.city(hop.ip).city.name
                except AddressNotFoundError:
                    city = None
            hops.append(hop.model_copy(update={"city": city}))
            if hop.ip == destination_ip:
                break

    return TracerouteCheckTaskResult(
        destination=destination,
        destination_ip=destination_ip,
        hops=hops,
    )
