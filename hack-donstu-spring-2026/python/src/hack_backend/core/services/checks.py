from collections.abc import Iterable
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from hack_backend.core.models.check import Check
from hack_backend.core.models.check_task.model import CheckTask
from hack_protocol.checks.base import BaseCheckTaskPayload, BaseCheckTaskResult


class StreamsServiceError(Exception):
    pass


class StreamNotFoundError(StreamsServiceError):
    pass


class CheckService:
    def __init__(
        self,
        orm_session: AsyncSession,
    ):
        self.orm_session = orm_session

    async def notify_check_task_failed(
        self,
        check_task_uid: UUID,
    ):
        stmt = (
            update(CheckTask)
            .where(CheckTask.uid == check_task_uid)
            .values({CheckTask.failed_count: CheckTask.failed_count + 1})
        )
        await self.orm_session.execute(stmt)

    async def create_check(
        self,
        payload: BaseCheckTaskPayload,
    ) -> Check:
        check = Check(
            payload=payload.model_dump(mode="json"),
        )
        self.orm_session.add(check)
        await self.orm_session.flush()
        await self.orm_session.refresh(check)

        return check

    async def acquire_next_check(
        self,
    ) -> Check | None:
        stmt = (
            select(Check)
            .where(Check.acked_at.is_(None))
            .order_by(Check.created_at.asc())
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        check = await self.orm_session.scalar(stmt)
        return check

    async def ack_check(
        self,
        check_uid: UUID,
    ) -> None:
        stmt = (
            update(Check)
            .where(Check.uid == check_uid)
            .values(acked_at=func.now())
        )
        await self.orm_session.execute(stmt)
        return None

    async def create_check_task(
        self,
        check_uid: UUID,
        payload: BaseCheckTaskPayload,
        bound_to_agent_id: int,
    ) -> CheckTask:
        check_task = CheckTask(
            check_uid=check_uid,
            payload=payload.model_dump(mode="json"),
            result=None,
            bound_to_agent_id=bound_to_agent_id,
        )
        self.orm_session.add(check_task)
        await self.orm_session.flush()
        return check_task

    async def acquire_next_check_task(self) -> CheckTask | None:
        stmt = (
            select(CheckTask)
            .where(CheckTask.acked_at.is_(None))
            .where(CheckTask.failed_count <= 2)  # todo: rebinding
            .order_by(CheckTask.created_at.asc())
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        check_task = await self.orm_session.scalar(stmt)
        return check_task

    async def ack_check_task(
        self,
        check_task_uid: UUID,
    ) -> None:
        stmt = (
            update(CheckTask)
            .where(CheckTask.uid == check_task_uid)
            .values(acked_at=func.now())
        )
        await self.orm_session.execute(stmt)
        return None

    async def get_check(
        self,
        check_uid: UUID,
    ) -> Check | None:
        stmt = select(Check).where(Check.uid == check_uid)
        return await self.orm_session.scalar(stmt)

    async def get_check_tasks_with(
        self,
        check_uid: UUID,
    ) -> Iterable[CheckTask]:
        stmt = select(CheckTask).where(CheckTask.check_uid == check_uid)
        return await self.orm_session.scalars(stmt)

    async def get_check_task(
        self,
        uid: UUID,
    ) -> CheckTask | None:
        return await self.orm_session.get(CheckTask, uid)

    async def store_check_task_result(
        self,
        check_task_uid: UUID,
        result: BaseCheckTaskResult,
    ) -> None:
        stmt = (
            update(CheckTask)
            .where(CheckTask.uid == check_task_uid)
            .values(
                result=result.model_dump(mode="json"),
                acked_at=func.now(),
            )
        )
        await self.orm_session.execute(stmt)
