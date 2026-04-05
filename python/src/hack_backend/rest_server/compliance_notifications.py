from __future__ import annotations

from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from hack_backend.core.compliance_notifications import (
    pop_pending_compliance_email_notifications,
)
from hack_backend.core.models import Environment, EnvironmentMember, User
from hack_backend.core.models.enums import EnvironmentMemberRole
from hack_backend.tasksd.email_tasks import send_compliance_event_email_task


async def dispatch_pending_compliance_email_notifications(
    session: AsyncSession,
) -> None:
    notifications = pop_pending_compliance_email_notifications(session)
    if not notifications:
        return

    environment_ids = sorted(
        {
            str(item.get("environment_id") or "").strip()
            for item in notifications
            if str(item.get("environment_id") or "").strip()
        }
    )
    if not environment_ids:
        return

    recipient_rows = (
        await session.execute(
            select(
                EnvironmentMember.environment_id,
                User.email,
                User.username,
                Environment.name,
            )
            .join(User, User.id == EnvironmentMember.user_id)
            .join(Environment, Environment.id == EnvironmentMember.environment_id)
            .where(
                EnvironmentMember.environment_id.in_(environment_ids),
                EnvironmentMember.role.in_(
                    [
                        EnvironmentMemberRole.OPERATOR,
                        EnvironmentMemberRole.OBSERVER,
                    ]
                ),
                User.email.is_not(None),
                User.email_verified.is_(True),
            )
        )
    ).all()

    recipients_by_environment: dict[str, list[tuple[str, str, str]]] = defaultdict(list)
    seen: set[tuple[str, str]] = set()
    for environment_id, email, username, environment_name in recipient_rows:
        normalized_env_id = str(environment_id)
        normalized_email = str(email or "").strip()
        if not normalized_email:
            continue
        dedupe_key = (normalized_env_id, normalized_email.lower())
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        recipients_by_environment[normalized_env_id].append(
            (
                normalized_email,
                str(username or ""),
                str(environment_name or normalized_env_id),
            )
        )

    for notification in notifications:
        environment_id = str(notification.get("environment_id") or "").strip()
        if not environment_id:
            continue
        for email, user_name, environment_name in recipients_by_environment.get(
            environment_id,
            [],
        ):
            await send_compliance_event_email_task.kiq(
                email_address=email,
                user_name=user_name,
                environment_name=environment_name,
                environment_id=environment_id,
                policy_name=str(notification.get("policy_name") or ""),
                event_kind=str(notification.get("event_kind") or ""),
                event_origin=str(notification.get("event_origin") or ""),
                subject_label=str(notification.get("subject_label") or ""),
                happened_at=str(notification.get("happened_at") or ""),
                matched_rule_labels=list(
                    notification.get("matched_rule_labels") or []
                ),
            )
