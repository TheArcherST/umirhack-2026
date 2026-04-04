import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from argon2 import PasswordHasher
from argon2 import exceptions as argon2_exceptions
from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession

from hack_backend.core.models import (
    Environment,
    EnvironmentMember,
    LoginSession,
    Project,
    ProjectMember,
    ProjectMemberRole,
    User,
)
from hack_backend.core.security import hash_secret, new_secret, verify_secret


class ServiceAccessError(Exception):
    pass


class ErrorUnauthorized(ServiceAccessError):
    pass


class ErrorEmailNotVerified(ServiceAccessError):
    pass


class ErrorEmailAlreadyExists(ServiceAccessError):
    pass


class ErrorUsernameAlreadyExists(ServiceAccessError):
    pass


class ErrorNoPendingPasswordChange(ServiceAccessError):
    pass


class ErrorPasswordChangeTokenExpired(ServiceAccessError):
    pass


class ErrorPasswordChangeTokenInvalid(ServiceAccessError):
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
                if existing_user.email_verified:
                    raise ErrorEmailAlreadyExists(
                        "User with this email already exists"
                    )

                conflicting_username = await self.orm_session.scalar(
                    select(User).where(
                        User.username == username,
                        User.id != existing_user.id,
                    )
                )
                if conflicting_username is not None:
                    raise ErrorUsernameAlreadyExists("Username already exists")

                existing_user.username = username
                existing_user.password_hash = self.ph.hash(password)
                existing_user.email_verified = False
                existing_user.otp_secret = None
                existing_user.email_verification_code_hash = None
                existing_user.email_verification_sent_at = None
                existing_user.email_verification_expires_at = None
                existing_user.email_verification_resend_available_at = None
                existing_user.email_verification_attempt_count = 0
                await self.orm_session.flush()
                return existing_user

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
            user=user,
        )
        self.orm_session.add(login_session)
        await self.orm_session.flush()

        return login_session

    async def resolve_bearer_login_session(
        self,
        authorization: str | None,
    ) -> LoginSession:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing bearer token")

        token = authorization.removeprefix("Bearer ").strip()
        if not token:
            raise HTTPException(status_code=401, detail="Missing bearer token")

        login_session = await self.orm_session.scalar(
            select(LoginSession)
            .options(joinedload(LoginSession.user))
            .where(LoginSession.token == token)
        )
        if login_session is None:
            raise HTTPException(status_code=401, detail="Invalid bearer token")
        return login_session

    async def require_project_member(
        self,
        project_id: str,
        *,
        user_id: int,
    ) -> Project:
        project = await self.orm_session.get(Project, project_id)
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")

        if project.owner_id == user_id:
            return project

        membership = await self.orm_session.get(
            ProjectMember,
            {"project_id": project_id, "user_id": user_id},
        )
        if membership is None:
            raise HTTPException(status_code=403, detail="Project access denied")
        return project

    async def require_project_admin(
        self,
        project_id: str,
        *,
        user_id: int,
    ) -> Project:
        project = await self.require_project_member(project_id, user_id=user_id)
        if project.owner_id == user_id:
            return project

        membership = await self.orm_session.get(
            ProjectMember,
            {"project_id": project_id, "user_id": user_id},
        )
        if (
            membership is None
            or membership.role != ProjectMemberRole.ADMIN
            or membership.invite_status != InviteStatus.ACCEPTED
        ):
            raise HTTPException(status_code=403, detail="Project admin access required")
        return project

    async def require_environment_member(
        self,
        environment_id: str,
        *,
        user_id: int,
    ) -> Environment:
        environment = await self.orm_session.get(Environment, environment_id)
        if environment is None:
            raise HTTPException(status_code=404, detail="Environment not found")

        project = await self.require_project_member(
            environment.project_id,
            user_id=user_id,
        )
        if project.owner_id == user_id:
            return environment

        membership = await self.orm_session.get(
            EnvironmentMember,
            {"environment_id": environment_id, "user_id": user_id},
        )
        if membership is None:
            raise HTTPException(
                status_code=403,
                detail="Environment access denied",
            )
        return environment

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

    async def search_users(
        self,
        *,
        query: str,
        exclude_user_id: int | None = None,
        limit: int = 10,
    ) -> list[User]:
        normalized_query = query.strip()
        if len(normalized_query) < 2:
            return []

        pattern = f"%{normalized_query.lower()}%"
        stmt = (
            select(User)
            .where(
                or_(
                    func.lower(User.username).like(pattern),
                    func.lower(func.coalesce(User.email, "")).like(pattern),
                )
            )
            .order_by(User.username.asc())
            .limit(limit)
        )
        if exclude_user_id is not None:
            stmt = stmt.where(User.id != exclude_user_id)

        return list(await self.orm_session.scalars(stmt))

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

    async def update_username(self, user: User, new_username: str) -> None:
        existing = await self.orm_session.scalar(
            select(User).where(User.username == new_username, User.id != user.id)
        )
        if existing is not None:
            raise ErrorUsernameAlreadyExists("Username already exists")
        user.username = new_username

    async def initiate_password_change(
        self,
        user: User,
        current_password: str,
        new_password: str,
        validity_hours: int = 1,
    ) -> str:
        await self._authenticate_user(user, current_password)
        token = new_secret(32)
        user.password_change_token_hash = hash_secret(token)
        user.password_change_new_hash = self.ph.hash(new_password)
        user.password_change_expires_at = datetime.now(tz=UTC) + timedelta(hours=validity_hours)
        return token

    async def confirm_password_change(self, token: str) -> User:
        user = await self._find_user_by_password_change_token(token)
        user.password_hash = user.password_change_new_hash  # type: ignore[assignment]
        self._clear_password_change_state(user)
        return user

    async def cancel_password_change(self, token: str) -> User:
        user = await self._find_user_by_password_change_token(token)
        self._clear_password_change_state(user)
        return user

    async def _find_user_by_password_change_token(self, token: str) -> User:
        token_hash = hash_secret(token)
        user = await self.orm_session.scalar(
            select(User).where(User.password_change_token_hash == token_hash)
        )
        if user is None:
            raise ErrorPasswordChangeTokenInvalid("Invalid token")
        expires_at = user.password_change_expires_at
        if expires_at is not None:
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=UTC)
            if expires_at <= datetime.now(tz=UTC):
                self._clear_password_change_state(user)
                raise ErrorPasswordChangeTokenExpired("Token expired")
        return user

    def _clear_password_change_state(self, user: User) -> None:
        user.password_change_token_hash = None
        user.password_change_new_hash = None
        user.password_change_expires_at = None

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
