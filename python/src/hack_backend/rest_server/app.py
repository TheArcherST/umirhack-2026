from contextlib import asynccontextmanager

from dishka import AsyncContainer, make_async_container
from dishka.integrations.fastapi import setup_dishka
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from hack_backend.core.providers import (
    ConfigHack,
    ProviderConfig,
    ProviderDatabase,
)
from hack_backend.core.services.providers import ProviderServices
from hack_backend.rest_server import exception_handlers, routers
from hack_backend.rest_server.providers import ProviderServer


def make_app_lifespan(container: AsyncContainer):
    @asynccontextmanager
    async def app_lifespan(app: FastAPI):
        yield
        await container.close()

    return app_lifespan


def create_app() -> FastAPI:
    config = ConfigHack()
    providers = (
        ProviderConfig(),
        ProviderDatabase(),
        ProviderServices(),
        ProviderServer(),
    )
    container = make_async_container(*providers)

    app = FastAPI(
        root_path=config.server.root_path,
        lifespan=make_app_lifespan(container),
    )
    setup_dishka(container, app)

    exception_handlers.register(app)
    app.include_router(routers.router)

    app.add_middleware(  # todo: adjust [sec]
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    return app
