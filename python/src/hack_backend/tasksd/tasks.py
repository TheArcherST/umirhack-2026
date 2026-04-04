from traceback import print_exception
from uuid import UUID

from dishka import FromDishka
from dishka.integrations.taskiq import inject

from hack_backend.core.services.agent import AgentService
from hack_backend.core.services.checks import CheckService
from hack_backend.core.services.uow_ctl import UoWCtl
from hack_backend.tasksd.broker import broker, container, setup_full_container
from hack_protocol.checks.unions import AnyCheckTaskResult

# Re-setup with full providers
container = setup_full_container()


@broker.task(retry_on_error=True, max_retries=3)
@inject(patch_module=True)
async def process_check_task(
    agent_service: FromDishka[AgentService],
    check_service: FromDishka[CheckService],
    uow_ctl: FromDishka[UoWCtl],
    check_task_uid: UUID,
):
    check_task = await check_service.get_check_task(check_task_uid)
    connector = await agent_service.get_connector(
        agent_id=check_task.bound_to_agent_id
    )

    e = None
    try:
        async with connector.connect() as conn:
            json_data = {"payload": check_task.payload}
            response = await conn.post("/check", json=json_data, timeout=40)
    except TimeoutError:
        print(f"Timeout error for agent {check_task.bound_to_agent_id}")
        await check_service.notify_check_task_failed(check_task.uid)
    except Exception as e:
        print(
            f"Some unknown error for agent {check_task.bound_to_agent_id}: `{e}`"
        )
        print_exception(e)
        await check_service.notify_check_task_failed(check_task.uid)
    else:
        if not response.is_success:
            print(
                f"Some problem on agent's {check_task.bound_to_agent_id} side: code `{response.status_code}`"
            )
            await check_service.notify_check_task_failed(check_task.uid)
        else:
            result = AnyCheckTaskResult.validate_python(response.json())
            print(f"Store result: {result}")
            await check_service.store_check_task_result(check_task.uid, result)
    await uow_ctl.commit()

    if e is not None:
        raise RuntimeError("Retry?") from e

    return None
