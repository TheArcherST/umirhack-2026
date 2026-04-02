import asyncio

from dishka import Provider, Scope, make_async_container, provide

from hack_backend.core.providers import ProviderConfig, ProviderDatabase
from hack_backend.core.services.agent import AgentService
from hack_backend.core.services.checks import CheckService
from hack_backend.core.services.providers import ProviderServices
from hack_backend.core.services.uow_ctl import UoWCtl
from hack_backend.rest_server.providers import AuthorizedUser
from hack_protocol.checks.unions import AnyCheckTaskPayload


class NoAuthorizedUser(Provider):
    @provide(scope=Scope.APP)
    async def get_authorized_user(self) -> AuthorizedUser:
        return None


providers = [
    ProviderConfig(),
    ProviderDatabase(),
    NoAuthorizedUser(),
    ProviderServices(),
]


async def async_main():
    from hack_backend.tasksd.tasks import process_check_task

    container = make_async_container(*providers)
    async with container(scope=Scope.SESSION) as app_c:
        while True:
            async with app_c(
                scope=Scope.REQUEST,
            ) as request_c:
                check_service = await request_c.get(CheckService)
                agent_service = await request_c.get(AgentService)
                check = await check_service.acquire_next_check()
                print(f"Acquired check: {check}")
                if check is None:
                    await asyncio.sleep(1)
                    continue
                async for i in await agent_service.stream_up_ids(
                    limit=10, random_order=True
                ):
                    check_task = await check_service.create_check_task(
                        check_uid=check.uid,
                        payload=AnyCheckTaskPayload.validate_python(
                            check.payload
                        ),
                        bound_to_agent_id=i,
                    )
                    await process_check_task.kiq(check_task_uid=check_task.uid)
                await check_service.ack_check(check_uid=check.uid)
                uow_ctl = await request_c.get(UoWCtl)
                await uow_ctl.commit()

            await asyncio.sleep(0.1)


def main():
    asyncio.run(async_main())
