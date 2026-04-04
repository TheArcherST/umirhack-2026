from typing import NewType

from dishka import Provider, Scope, from_context, provide
from fastapi import FastAPI
from fastapi.requests import Request
from starlette.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from hack_backend.core.models import LoginSession, User
from hack_backend.rest_server.dependencies import resolve_bearer_login_session

AuthorizedUser = NewType("AuthorizedUser", User)
CurrentLoginSession = NewType("CurrentLoginSession", LoginSession)


class ProviderServer(Provider):
    app = from_context(FastAPI, scope=Scope.SESSION)
    request = from_context(provides=Request, scope=Scope.REQUEST)

    @provide(scope=Scope.SESSION, cache=False)
    def get_test_client(self, app: FastAPI) -> TestClient:
        return TestClient(app)

    @provide(scope=Scope.REQUEST)
    async def get_current_login_session(
        self,
        request: Request,
        orm_session: AsyncSession,
    ) -> CurrentLoginSession:
        login_session = await resolve_bearer_login_session(
            authorization=request.headers.get("Authorization"),
            session=orm_session,
        )
        return CurrentLoginSession(login_session)

    @provide(scope=Scope.REQUEST)
    async def get_authorized_user(
        self,
        current_login_session: CurrentLoginSession,
    ) -> AuthorizedUser:
        return AuthorizedUser(current_login_session.user)
