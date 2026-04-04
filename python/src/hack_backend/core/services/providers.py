from argon2 import PasswordHasher
from dishka import Provider, Scope, provide
from sqlalchemy.ext.asyncio import AsyncSession

from hack_backend.core.services.access import AccessService
from hack_backend.core.services.agent import AgentService
from hack_backend.core.services.checks import CheckService
from hack_backend.core.services.email_verification import EmailVerificationService
from hack_backend.core.services.uow_ctl import UoWCtl


class ProviderServices(Provider):
    get_streams_service = provide(
        CheckService,
        scope=Scope.REQUEST,
    )
    get_access_service = provide(
        AccessService,
        scope=Scope.REQUEST,
    )
    get_agent_service = provide(
        AgentService,
        scope=Scope.REQUEST,
    )
    get_email_verification_service = provide(
        EmailVerificationService,
        scope=Scope.REQUEST,
    )

    @provide(scope=Scope.REQUEST)
    async def get_uow_ctl(
        self,
        orm_session: AsyncSession,
    ) -> UoWCtl:
        return orm_session

    @provide(scope=Scope.APP)
    def get_password_hasher(self) -> PasswordHasher:
        return PasswordHasher()
