from typing import NewType

from dishka import Provider, Scope, from_context, provide
from fastapi import FastAPI
from fastapi import HTTPException
from fastapi.requests import Request
from starlette.testclient import TestClient

from hack_backend.core.models import Agent, LoginSession, User
from hack_backend.core.services.access import AccessService
from hack_backend.core.services.agent_runtime_service import AgentRuntimeService

AuthorizedUser = NewType("AuthorizedUser", User)
CurrentLoginSession = NewType("CurrentLoginSession", LoginSession)
CurrentAgent = NewType("CurrentAgent", Agent)


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
        access_service: AccessService,
    ) -> CurrentLoginSession:
        login_session = await access_service.resolve_bearer_login_session(
            request.headers.get("Authorization"),
        )
        return CurrentLoginSession(login_session)

    @provide(scope=Scope.REQUEST)
    async def get_authorized_user(
        self,
        current_login_session: CurrentLoginSession,
    ) -> AuthorizedUser:
        return AuthorizedUser(current_login_session.user)

    @provide(scope=Scope.REQUEST)
    async def get_current_agent(
        self,
        request: Request,
        runtime_service: AgentRuntimeService,
    ) -> CurrentAgent:
        agent_id = request.headers.get("X-Agent-Id")
        agent_token = request.headers.get("X-Agent-Token")
        if not agent_id or not agent_token:
            raise HTTPException(status_code=401, detail="Missing agent credentials")
        agent = await runtime_service.authenticate(
            agent_id=agent_id,
            agent_token=agent_token,
        )
        return CurrentAgent(agent)
