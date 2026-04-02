from uuid import UUID

from pydantic import computed_field

from hack_protocol.checks.unions import (
    AnyCheckTaskPayloadType,
    AnyCheckTaskResultType,
)

from .base import BaseDTO


class CreateCheckDTO(BaseDTO):
    payload: AnyCheckTaskPayloadType


class BoundToAgentDTO(BaseDTO):
    name: str


class CheckTaskDTO(BaseDTO):
    bound_to_agent: BoundToAgentDTO
    payload: AnyCheckTaskPayloadType
    result: AnyCheckTaskResultType | None
    failed_count: int

    @computed_field
    @property
    def is_failed(self) -> bool:
        return self.failed_count >= 3


class CheckDTO(BaseDTO):
    uid: UUID
    tasks: list[CheckTaskDTO]
