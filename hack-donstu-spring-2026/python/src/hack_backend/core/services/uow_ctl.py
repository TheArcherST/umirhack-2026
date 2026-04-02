from typing import Protocol


class UoWCtl(Protocol):
    """Protocol of Unit of Work controller"""

    async def commit(self):
        raise NotImplementedError

    async def rollback(self):
        raise NotImplementedError
