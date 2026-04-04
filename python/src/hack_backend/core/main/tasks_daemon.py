from __future__ import annotations

import asyncio
import logging

from hack_backend.core.database import get_session_factory, init_database
from hack_backend.core.platform_ops import (
    expand_schedule_rules,
    recover_expired_task_leases,
    refresh_agent_state,
)

logger = logging.getLogger(__name__)
POLL_INTERVAL_SECONDS = 5


async def run_once() -> dict[str, int]:
    session_factory = get_session_factory()
    async with session_factory() as session:
        await refresh_agent_state(session)
        recovered = await recover_expired_task_leases(session)
        expanded = await expand_schedule_rules(session)
        await session.commit()
        return {
            "recovered_leases": recovered,
            "expanded_task_runs": expanded,
        }


async def async_main() -> None:
    logging.basicConfig(level=logging.INFO)
    await init_database()
    while True:
        stats = await run_once()
        logger.info("worker tick: %s", stats)
        await asyncio.sleep(POLL_INTERVAL_SECONDS)


def main() -> None:
    asyncio.run(async_main())


if __name__ == "__main__":
    main()
