from pydantic import BaseModel

from .type_enum import CheckTaskTypeEnum


class BaseCheckTaskPayload(BaseModel):
    type: CheckTaskTypeEnum


class BaseCheckTaskResult(BaseModel):
    type: CheckTaskTypeEnum
