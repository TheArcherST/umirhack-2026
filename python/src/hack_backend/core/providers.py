from collections.abc import AsyncGenerator, Iterable

from dishka import Provider, Scope, provide
from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict
from redis.asyncio import Redis as AsyncRedis
from sqlalchemy import Engine, create_engine
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    create_async_engine,
)
from sqlalchemy.orm import Session


class ConfigPostgres(BaseModel):
    host: str
    port: int
    user: str
    password: str
    database: str
    test_database: str | None = None
    use_test_by_default: bool = False
    pool_size: int = 5
    pool_max_overflow: int = 10

    def get_test_database_name(self) -> str:
        return self.test_database or f"{self.database}_test"

    def get_sqlalchemy_url(
        self,
        driver: str,
        *,
        is_test_database: bool | None = None,
    ):
        if is_test_database is None:
            is_test_database = self.use_test_by_default

        database = self.database
        if is_test_database:
            database = self.get_test_database_name()

        return f"postgresql+{driver}://{self.user}:{self.password}@{self.host}:{self.port}/{database}"


class ConfigRedis(BaseModel):
    host: str
    port: int = 6379
    db: int = 0
    username: str | None = None
    password: str | None = None
    ssl: bool = False
    decode_responses: bool = False
    max_connections: int | None = None
    socket_timeout: float | None = None

    def get_redis_url(self) -> str:
        scheme = "rediss" if self.ssl else "redis"
        auth = ""
        if self.username and self.password:
            auth = f"{self.username}:{self.password}@"
        elif self.password:
            auth = f":{self.password}@"
        return f"{scheme}://{auth}{self.host}:{self.port}/{self.db}"


class ConfigServer(BaseModel):
    root_path: str = ""


class ConfigEmail(BaseModel):
    resend_api_key: str = ""
    from_address: str = ""
    template_name: str = ""
    app_name: str = "Linkoo"
    code_validity_minutes: int = 5


class ConfigHack(BaseSettings):
    model_config = SettingsConfigDict(
        env_nested_delimiter="__",
        env_file=".env",
        env_prefix="HACK__",
    )

    postgres: ConfigPostgres
    redis: ConfigRedis
    server: ConfigServer = ConfigServer()
    email: ConfigEmail = ConfigEmail()


class ProviderConfig(Provider):
    @provide(scope=Scope.APP)
    def get_config_hack(self) -> ConfigHack:
        return ConfigHack()  # type: ignore

    @provide(scope=Scope.APP)
    def get_config_postgres(
        self,
        config: ConfigHack,
    ) -> ConfigPostgres:
        return config.postgres

    @provide(scope=Scope.APP)
    def get_config_redis(
        self,
        config: ConfigHack,
    ) -> ConfigRedis:
        return config.redis

    @provide(scope=Scope.APP)
    def get_config_email(
        self,
        config: ConfigHack,
    ) -> ConfigEmail:
        return config.email


class ProviderDatabase(Provider):
    @provide(scope=Scope.APP)
    def get_database_engine(
        self,
        config: ConfigPostgres,
    ) -> AsyncEngine:
        return create_async_engine(
            config.get_sqlalchemy_url("psycopg"),
        )

    @provide(scope=Scope.SESSION)
    async def get_database_session(
        self,
        engine: AsyncEngine,
    ) -> AsyncGenerator[AsyncSession, None]:
        async with AsyncSession(
            engine,
            expire_on_commit=False,
        ) as session:
            yield session


class ProviderRedis(Provider):
    @provide(scope=Scope.APP)
    async def get_redis_client(
        self,
        config: ConfigRedis,
    ) -> AsyncGenerator[AsyncRedis, None]:
        client = AsyncRedis.from_url(
            config.get_redis_url(),
            decode_responses=config.decode_responses,
            max_connections=config.max_connections,
            socket_timeout=config.socket_timeout,
            ssl=config.ssl,
        )
        try:
            yield client
        finally:
            await client.close()
            if client.connection_pool:
                await client.connection_pool.disconnect()


class ProviderTestDatabase(Provider):
    def get_database_engine(
        self,
        config: ConfigPostgres,
    ) -> Engine:
        return create_engine(
            config.get_sqlalchemy_url("psycopg"),
        )

    def get_database_session(
        self,
        engine: Engine,
    ) -> Iterable[Session]:
        with Session(engine) as session:
            yield session
