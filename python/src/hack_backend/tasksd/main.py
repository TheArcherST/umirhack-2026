import asyncio
from traceback import print_exception, print_tb

from dishka import Provider, Scope, make_async_container, provide

from hack_backend.core.providers import ProviderConfig, ProviderDatabase
from hack_backend.core.services.agent import AgentService
from hack_backend.core.services.checks import CheckService
from hack_backend.core.services.providers import ProviderServices
from hack_backend.core.services.uow_ctl import UoWCtl
from hack_backend.rest_server.providers import AuthorizedUser
from hack_protocol.checks.unions import AnyCheckTaskResult


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
    container = make_async_container(*providers)
    async with container(scope=Scope.SESSION) as app_c:
        while True:
            async with app_c(
                scope=Scope.REQUEST,
            ) as request_c:
                check_service = await request_c.get(CheckService)
                agent_service = await request_c.get(AgentService)
                check_task = await check_service.acquire_next_check_task()
                if check_task is None:
                    await asyncio.sleep(1)
                    continue
                connector = await agent_service.get_connector(
                    agent_id=check_task.bound_to_agent_id,
                )
                uow_ctl = await request_c.get(UoWCtl)
                try:
                    async with connector.connect() as conn:
                        json_data = {"payload": check_task.payload}
                        response = await conn.post(
                            "/check", json=json_data, timeout=40
                        )
                except TimeoutError:
                    print(
                        f"Timeout error for agent {check_task.bound_to_agent_id}"
                    )
                    await check_service.notify_check_task_failed(
                        check_task.uid
                    )
                    await uow_ctl.commit()
                    continue
                except Exception as e:
                    print(
                        f"Some unknown error for agent {check_task.bound_to_agent_id}: `{e}`"
                    )
                    print_tb(e.__traceback__)
                    print_exception(e)
                    await check_service.notify_check_task_failed(
                        check_task.uid
                    )
                    await uow_ctl.commit()
                    continue

                if not response.is_success:
                    print(
                        f"Some problem on agent's {check_task.bound_to_agent_id} side: code `{response.status_code}`"
                    )
                    await check_service.notify_check_task_failed(
                        check_task.uid
                    )
                    await uow_ctl.commit()
                    continue

                result = AnyCheckTaskResult.validate_python(response.json())
                print(f"Store result: {result}")

                await check_service.store_check_task_result(
                    check_task.uid, result
                )
                await uow_ctl.commit()

            await asyncio.sleep(0.1)


def main():
    asyncio.run(async_main())
