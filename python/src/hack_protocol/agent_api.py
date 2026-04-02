from hack_protocol.base import BaseDTO
from hack_protocol.checks.unions import AnyCheckTaskPayloadType


class PerformCheckDTO(BaseDTO):
    payload: AnyCheckTaskPayloadType
