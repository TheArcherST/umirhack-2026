from fastapi import APIRouter

from . import (
    agent_api,
    access,
    agents,
    api_keys,
    dev_router,
    email_verification,
    environments,
    hosts,
    projects,
    schedule_rules,
    task_runs,
    task_templates,
    user_settings,
)

router = APIRouter()


router.include_router(access.router)
router.include_router(email_verification.router)
router.include_router(user_settings.router)
router.include_router(dev_router.router)
router.include_router(projects.router)
router.include_router(environments.router)
router.include_router(agents.router)
router.include_router(hosts.router)
router.include_router(task_templates.router)
router.include_router(task_runs.router)
router.include_router(schedule_rules.router)
router.include_router(api_keys.router)
router.include_router(agent_api.router)


__all__ = [
    "router",
]
