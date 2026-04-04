import secrets
from uuid import UUID

from argon2 import PasswordHasher
from argon2 import exceptions as argon2_exceptions
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from hack_backend.core.models import LoginSession, User


class ServiceAccessError(Exception):
    pass


class ErrorUnauthorized(ServiceAccessError):
    pass


class ErrorEmailNotVerified(ServiceAccessError):
    pass


class AccessService:
    def __init__(
        self,
        orm_session: AsyncSession,
        ph: PasswordHasher,
    ):
        self.orm_session = orm_session
        self.ph = ph

    async def register(
        self,
        username: str,
        password: str,
        email: str | None = None,
    ) -> User:
        if email is not None:
            existing_user = await self.orm_session.scalar(
                select(User).where(User.email == email)
            )
            if existing_user is not None:
                raise ServiceAccessError("User with this email already exists")

        password_hash = self.ph.hash(password)
        user = User(
            username=username,
            password_hash=password_hash,
            email=email,
        )
        self.orm_session.add(user)
        await self.orm_session.flush()

        return user

    async def login(
        self,
        username: str,
        password: str,
        user_agent: str | None,
    ) -> LoginSession:
        """
        :raise ErrorUnauthorized:
        """

        # note: timing-attack protected, but registration may expose
        #  if user with the username registered or not nevertheless, if it's
        #  not protected from unauthorized access.

        user = await self._identify_user(username)
        if user is None:
            await self._dummy_authentication()
            raise ErrorUnauthorized
        await self._authenticate_user(user, password)
        if user.email and not user.email_verified:
            raise ErrorEmailNotVerified

        return await self.create_login_session(
            user=user,
            user_agent=user_agent,
        )

    async def create_login_session(
        self,
        *,
        user: User,
        user_agent: str | None,
    ) -> LoginSession:
        login_session = LoginSession(
            user_agent=user_agent,
            token=secrets.token_hex(nbytes=32),
            user_id=user.id,
        )
        self.orm_session.add(login_session)
        await self.orm_session.flush()

        return login_session

    async def lookup_login_session(
        self,
        login_session_uid: UUID,
        login_session_token: str,
    ) -> LoginSession:
        login_session = await self.orm_session.get(
            LoginSession, login_session_uid
        )

        if login_session is None:
            raise ErrorUnauthorized

        if not secrets.compare_digest(
            login_session.token,
            login_session_token,
        ):
            raise ErrorUnauthorized

        return login_session

    async def _identify_user(
        self,
        username: str,
    ) -> User | None:
        stmt = select(User).where(User.username == username)
        user = await self.orm_session.scalar(stmt)
        return user

    async def _dummy_authentication(
        self,
    ):
        dummy_hash = (
            "$argon2id$v=19$m=65536,t=3,p=4$1/kKopFhFTmJP0aLfW"
            "15XQ$fwP4HIJ1Dwtk7Fb5XzW8HDenJ7WroA6fiz0FAynO1cA"
        )
        dummy_password = "dummy password horse battery"
        self.ph.verify(dummy_hash, dummy_password)
        await self._dummy_rehash()

    async def _dummy_rehash(self):
        self.ph.hash("password horse battery dummy")

    async def _authenticate_user(
        self,
        user: User,
        password: str,
    ) -> None:
        try:
            self.ph.verify(user.password_hash, password)
        except argon2_exceptions.VerifyMismatchError as e:
            await self._dummy_rehash()
            raise ErrorUnauthorized from e

        if self.ph.check_needs_rehash(user.password_hash):
            user.password_hash = self.ph.hash(password)
        else:
            await self._dummy_rehash()

        return None
