# syntax=docker/dockerfile:1.7
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim

WORKDIR /usr/src/app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      netcat-traditional \
      nmap \
      cron \
      dnsutils \
      wget \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_LINK_MODE=copy \
    VIRTUAL_ENV=/usr/src/app/.venv \
    PATH="/usr/src/app/.venv/bin:$PATH"

RUN wget https://github.com/P3TERX/GeoLite.mmdb/releases/latest/download/GeoLite2-ASN.mmdb
RUN wget https://github.com/P3TERX/GeoLite.mmdb/releases/latest/download/GeoLite2-City.mmdb

COPY cron-update-geoip /etc/cron.d/cron-update-geoip
RUN chmod 0644 /etc/cron.d/cron-update-geoip \
    && crontab /etc/cron.d/cron-update-geoip

RUN useradd -m appuser \
    && mkdir -p /home/appuser/.cache/uv \
    && chown -R appuser:appuser /usr/src/app /home/appuser/.cache/uv

USER appuser:appuser

COPY --chown=appuser:appuser pyproject.toml uv.lock ./

RUN --mount=type=cache,target=/home/appuser/.cache/uv,uid=1000,gid=1000 \
    uv sync --frozen --no-install-project

COPY --chown=appuser:appuser . .

RUN --mount=type=cache,target=/home/appuser/.cache/uv,uid=1000,gid=1000 \
    uv sync --frozen
