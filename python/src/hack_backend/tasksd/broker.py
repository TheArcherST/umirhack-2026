"""
Shared taskiq broker + dishka setup.

Usage:
  taskiq worker hack_backend.tasksd.broker:broker   # email tasks worker
  taskiq worker hack_backend.tasksd.tasks:broker    # full tasks worker
"""

from dishka import FromDishka, make_async_container
from dishka.integrations.taskiq import TaskiqProvider, setup_dishka
from taskiq import SimpleRetryMiddleware, TaskiqScheduler
from taskiq.schedule_sources import LabelScheduleSource
from taskiq_redis import ListQueueBroker

from hack_backend.core.providers import ProviderConfig, ProviderDatabase

broker = ListQueueBroker("redis://redis:6379/1").with_middlewares(
    SimpleRetryMiddleware(default_retry_count=3)
)

non_dynamic_scheduler = TaskiqScheduler(
    broker, sources=[LabelScheduleSource(broker)]
)

# Minimal providers — works for email tasks without circular imports
_base_providers = (
    ProviderConfig(),
    ProviderDatabase(),
    TaskiqProvider(),
)

container = make_async_container(*_base_providers)
setup_dishka(container=container, broker=broker)


def setup_full_container():
    """Re-setup broker with full service providers (for tasksd-worker)."""
    from hack_backend.bindingd.main import NoAuthorizedUser
    from hack_backend.core.services.providers import ProviderServices

    full_providers = (
        ProviderConfig(),
        ProviderDatabase(),
        ProviderServices(),
        NoAuthorizedUser(),
        TaskiqProvider(),
    )
    full_container = make_async_container(*full_providers)
    setup_dishka(container=full_container, broker=broker)
    return full_container
