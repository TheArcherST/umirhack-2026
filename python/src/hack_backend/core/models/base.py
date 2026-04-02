from datetime import datetime, timezone
from typing import Annotated

from sqlalchemy.orm import DeclarativeBase, mapped_column


class Base(DeclarativeBase):
    pass


CreatedAt = Annotated[
    datetime, mapped_column(default=lambda: datetime.now(tz=timezone.utc))
]
