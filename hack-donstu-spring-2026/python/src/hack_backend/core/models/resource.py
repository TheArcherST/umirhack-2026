from sqlalchemy.orm import Mapped, mapped_column

from hack_backend.core.models.base import Base, CreatedAt


class Resource(Base):
    """
    Resource is something that can be checked; entity that is to be up or down,
    for which check are performed to inspect it's actual state cross Internet.

    """

    __tablename__ = "resource"

    id: Mapped[int] = mapped_column(primary_key=True)
    uri: Mapped[str]

    created_at: Mapped[CreatedAt]
