from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from hack_backend.core.providers import ConfigHack

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def get_engine() -> AsyncEngine:
    global _engine, _session_factory

    if _engine is None:
        config = ConfigHack()
        _engine = create_async_engine(
            config.postgres.get_sqlalchemy_url("psycopg"),
            future=True,
        )
        _session_factory = async_sessionmaker(
            _engine,
            expire_on_commit=False,
        )

    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    get_engine()
    assert _session_factory is not None
    return _session_factory


async def get_db_session() -> AsyncIterator[AsyncSession]:
    session_factory = get_session_factory()
    async with session_factory() as session:
        yield session


async def init_database() -> None:
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.execute(text("SELECT 1"))
