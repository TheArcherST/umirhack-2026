from __future__ import annotations

import ipaddress
from urllib.parse import urlsplit

from hack_backend.core.models import Host


def canonicalize_endpoint_host(value: str | None) -> str | None:
    raw_value = str(value or "").strip()
    if not raw_value:
        return None

    candidate = raw_value
    if "://" in raw_value:
        parsed = urlsplit(raw_value)
        candidate = parsed.hostname or raw_value
    else:
        if "/" in raw_value:
            candidate = raw_value.split("/", 1)[0]
        if candidate.startswith("[") and "]" in candidate:
            candidate = candidate[1:candidate.index("]")]
        elif ":" in candidate and candidate.count(":") == 1:
            candidate = candidate.split(":", 1)[0]

    normalized = candidate.strip().strip(".").lower()
    return normalized or None


def host_resolution_aliases(host: Host) -> set[str]:
    aliases = {
        canonicalize_endpoint_host(host.hostname),
        canonicalize_endpoint_host(host.primary_ipv4),
        canonicalize_endpoint_host(host.primary_ipv6),
        canonicalize_endpoint_host(host.name),
        canonicalize_endpoint_host(host.internal_identifier),
    }
    return {alias for alias in aliases if alias}


def host_selector_for_host(host: Host) -> dict[str, list[str]]:
    selector = {
        "host_ids": [host.id],
        "internal_identifiers": [],
        "hostnames": [],
        "names": [],
        "ip_addresses": [],
    }
    if host.internal_identifier:
        selector["internal_identifiers"].append(host.internal_identifier)
    if host.hostname:
        selector["hostnames"].append(host.hostname)
    if host.name:
        selector["names"].append(host.name)
    if host.primary_ipv4:
        selector["ip_addresses"].append(host.primary_ipv4)
    if host.primary_ipv6:
        selector["ip_addresses"].append(host.primary_ipv6)
    return selector


def merge_host_selectors(selectors: list[dict[str, list[str]]]) -> dict[str, list[str]]:
    merged = {
        "host_ids": [],
        "internal_identifiers": [],
        "hostnames": [],
        "names": [],
        "ip_addresses": [],
    }
    for selector in selectors:
        for key in merged:
            for value in selector.get(key) or []:
                normalized = str(value or "").strip()
                if normalized and normalized not in merged[key]:
                    merged[key].append(normalized)
    return merged


def host_matches_selector(
    selector: dict[str, list[str]] | None,
    *,
    host: Host | None,
    host_id: str | None,
) -> bool:
    if selector is None:
        return True

    host_ids = {str(value) for value in selector.get("host_ids") or []}
    if host_id and host_id in host_ids:
        return True
    if host is None:
        return False

    if _value_matches_any(
        host.internal_identifier,
        selector.get("internal_identifiers") or [],
    ):
        return True
    if _value_matches_any(host.hostname, selector.get("hostnames") or []):
        return True
    if _value_matches_any(host.name, selector.get("names") or []):
        return True

    ip_values = selector.get("ip_addresses") or []
    if _value_matches_any(host.primary_ipv4, ip_values) or _value_matches_any(
        host.primary_ipv6,
        ip_values,
    ):
        return True

    subnet_values = selector.get("ip_subnets") or []
    if subnet_values and (
        _ip_matches_subnets(host.primary_ipv4, subnet_values)
        or _ip_matches_subnets(host.primary_ipv6, subnet_values)
    ):
        return True

    return not any(selector.values())


def _value_matches_any(value: str | None, expected_values: list[str]) -> bool:
    normalized_value = canonicalize_endpoint_host(value)
    expected = {
        canonicalize_endpoint_host(item)
        for item in expected_values
        if canonicalize_endpoint_host(item)
    }
    return normalized_value is not None and normalized_value in expected


def _ip_matches_subnets(value: str | None, subnets: list[str]) -> bool:
    if not value:
        return False
    try:
        ip_value = ipaddress.ip_address(value)
    except ValueError:
        return False

    for raw_subnet in subnets:
        try:
            network = ipaddress.ip_network(str(raw_subnet), strict=False)
        except ValueError:
            continue
        if ip_value in network:
            return True
    return False
