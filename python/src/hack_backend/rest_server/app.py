from __future__ import annotations

from contextlib import asynccontextmanager

from dishka import AsyncContainer, make_async_container
from dishka.integrations.fastapi import setup_dishka
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from hack_backend.core.database import init_database
from hack_backend.core.providers import ConfigHack, ProviderConfig, ProviderDatabase
from hack_backend.core.services.providers import ProviderServices
from hack_backend.rest_server import routers
from hack_backend.rest_server.providers import ProviderServer


def make_lifespan(container: AsyncContainer):
    @asynccontextmanager
    async def lifespan(_: FastAPI):
        await init_database()
        yield
        await container.close()

    return lifespan


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
        lifespan=make_lifespan(container),
    )
    setup_dishka(container, app)
    app.include_router(routers.router)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    return app
