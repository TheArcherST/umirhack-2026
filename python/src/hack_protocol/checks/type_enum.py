from enum import StrEnum


class CheckTaskTypeEnum(StrEnum):
    DNS = "dns"
    PING = "ping"
    GEOIP = "geoip"
    HTTP = "http"
    NMAP = "nmap"
    TCP_AND_UDP = "tcp_and_udp"
    TRACEROUTE = "traceroute"
