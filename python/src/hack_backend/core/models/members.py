from __future__ import annotations

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, CreatedAt
from .enums import (
    EnvironmentMemberRole,
    InviteStatus,
    ProjectMemberRole,
)


class ProjectMember(Base):
    __tablename__ = "project_member"

    project_id: Mapped[str] = mapped_column(
        ForeignKey("project.id"),
        primary_key=True,
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("user.id"), primary_key=True)
    role: Mapped[ProjectMemberRole] = mapped_column(
        default=ProjectMemberRole.MEMBER,
    )
    invite_status: Mapped[InviteStatus] = mapped_column(
        default=InviteStatus.PENDING,
    )
    invited_at: Mapped[CreatedAt]


class EnvironmentMember(Base):
    __tablename__ = "environment_member"

    environment_id: Mapped[str] = mapped_column(
        ForeignKey("environment.id"),
        primary_key=True,
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("user.id"), primary_key=True)
    role: Mapped[EnvironmentMemberRole] = mapped_column(
        default=EnvironmentMemberRole.OBSERVER,
    )
    assigned_at: Mapped[CreatedAt]
