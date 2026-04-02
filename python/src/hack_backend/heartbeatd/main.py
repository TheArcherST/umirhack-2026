from datetime import datetime, timedelta
from traceback import print_exception

from dishka import FromDishka, make_async_container
from dishka.integrations.taskiq import TaskiqProvider, inject, setup_dishka
from taskiq import TaskiqScheduler
from taskiq.schedule_sources import LabelScheduleSource
from taskiq_redis import ListQueueBroker, RedisScheduleSource

from hack_backend.bindingd.main import NoAuthorizedUser
from hack_backend.core.models.agent import AgentStatus
from hack_backend.core.providers import ProviderConfig, ProviderDatabase
from hack_backend.core.services.agent import AgentService
from hack_backend.core.services.providers import ProviderServices
from hack_backend.core.services.uow_ctl import UoWCtl

providers = (
    ProviderConfig(),
    ProviderDatabase(),
    ProviderServices(),
    NoAuthorizedUser(),
    TaskiqProvider(),
)

# Here's the broker that is going to execute tasks
broker = ListQueueBroker("redis://redis:6379/0")

# Here's the source that is used to store scheduled tasks
redis_source = RedisScheduleSource("redis://redis:6379/0")

# And here's the scheduler that is used to query scheduled sources
scheduler = TaskiqScheduler(broker, sources=[redis_source])

non_dynamic_scheduler = TaskiqScheduler(
    broker, sources=[LabelScheduleSource(broker)]
)


@broker.task
@inject(patch_module=True)
async def heartbit(
    agent_service: FromDishka[AgentService],
    uow_ctl: FromDishka[UoWCtl],
    agent_id: int,
):
    print("Enter heartbit check")
    connector = await agent_service.get_connector(agent_id)
    try:
        async with connector.connect(timeout=3) as conn:
            await conn.options("/", timeout=3)
            # todo: heartbit endpoint
    except Exception as e:
        print(f"Error while trying to connect to agent {agent_id}: `{e}`")
        print_exception(e)
        status = AgentStatus.DOWN
    else:
        status = AgentStatus.UP

    await agent_service.heartbit_mark(
        agent_id=agent_id,
        status=status,
    )

    print(f"Status of agent {agent_id} is set to {status}")
    await uow_ctl.commit()


@broker.task(schedule=[{"cron": "*/1 * * * *"}])
@inject(patch_module=True)
async def heartbeat_schedule_loop(
    agent_service: FromDishka[AgentService],
):
    print("Enter heartbeat schedule loop")
    async for i in await agent_service.stream_up_ids(is_up=False):
        for j in range(4):
            await heartbit.schedule_by_time(
                redis_source,
                datetime.now() + timedelta(seconds=j * 20),
                agent_id=i,
            )


container = make_async_container(*providers)
setup_dishka(container=container, broker=broker)
