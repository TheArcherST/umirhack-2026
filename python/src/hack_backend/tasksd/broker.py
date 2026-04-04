"""
Shared taskiq broker + dishka setup.

Usage:
  taskiq worker hack_backend.tasksd.broker:broker   # email tasks worker
"""

from dishka import FromDishka, make_async_container
from dishka.integrations.taskiq import TaskiqProvider, setup_dishka
from taskiq import SimpleRetryMiddleware
from taskiq_redis import ListQueueBroker

from hack_backend.core.providers import ProviderConfig, ProviderDatabase

broker = ListQueueBroker("redis://redis:6379/1").with_middlewares(
    SimpleRetryMiddleware(default_retry_count=3)
)

# Minimal providers — works for email tasks without circular imports
_base_providers = (
    ProviderConfig(),
    ProviderDatabase(),
    TaskiqProvider(),
)

container = make_async_container(*_base_providers)
setup_dishka(container=container, broker=broker)
