from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from dishka import FromDishka
from dishka.integrations.fastapi import inject
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, PlainTextResponse
from pydantic import BaseModel
from sqlalchemy import select

from hack_backend.core.providers import ConfigHack
from hack_backend.core.models import Agent, AgentBootstrapToken
from hack_backend.core.security import hash_secret
from hack_backend.core.services.access import AccessService
from hack_backend.core.services.platform_service import PlatformService
from hack_backend.core.services.uow_ctl import UoWCtl
from hack_backend.rest_server.agent_install import (
    artifact_relative_path,
    install_command_for_script,
    normalize_install_platform,
    parse_install_platform,
    render_install_script,
    script_kind_for_platform,
)
from hack_backend.rest_server.providers import AuthorizedUser
from hack_backend.rest_server.schemas.platform import AgentDTO, InstallScriptDTO, TaskRunDTO
from hack_backend.rest_server.serializers import agent_to_dto, task_run_to_dto

router = APIRouter(tags=["agents"])


def _public_agent_url(url: str, *, config: ConfigHack) -> str:
    public_origin = (config.server.agent_public_origin or "").strip().rstrip("/")
    if not public_origin:
        return url

    current = urlsplit(url)
    override = urlsplit(
        public_origin if "://" in public_origin else f"//{public_origin}"
    )
    scheme = override.scheme or current.scheme
    netloc = override.netloc or override.path
    if not netloc:
        return url
    return urlunsplit((scheme, netloc, current.path, current.query, current.fragment))


class CreateAgentPayload(BaseModel):
    project_id: str
    name: str
    declared_os: str | None = None
    safe_install: bool = False
    environment_ids: list[str]


class UpdateAgentPayload(BaseModel):
    name: str | None = None
    safe_install: bool | None = None
    environment_ids: list[str] | None = None


@router.get("/agents", response_model=list[AgentDTO])
@inject
async def list_agents(
    project_id: str,
    current_user: FromDishka[AuthorizedUser],
    access_service: FromDishka[AccessService],
    platform_service: FromDishka[PlatformService],
    uow_ctl: FromDishka[UoWCtl],
    environment_id: str | None = None,
    status: str | None = None,
) -> list[AgentDTO]:
    await access_service.require_project_member(
        project_id,
        user_id=current_user.id,
    )
    agents, environments_by_agent = await platform_service.list_agents(
        project_id=project_id,
        environment_id=environment_id,
        status=status,
    )
    await uow_ctl.commit()
    return [
        agent_to_dto(
            agent,
            environments_by_agent.get(agent.id, []),
        )
        for agent in agents
    ]


@router.post("/agents", status_code=201, response_model=AgentDTO)
@inject
async def create_agent(
    payload: CreateAgentPayload,
    current_user: FromDishka[AuthorizedUser],
    access_service: FromDishka[AccessService],
    platform_service: FromDishka[PlatformService],
    uow_ctl: FromDishka[UoWCtl],
) -> AgentDTO:
    await access_service.require_project_member(
        payload.project_id,
        user_id=current_user.id,
    )
    agent, environments = await platform_service.create_agent(
        project_id=payload.project_id,
        name=payload.name,
        declared_os=payload.declared_os,
        safe_install=payload.safe_install,
        environment_ids=payload.environment_ids,
    )
    await uow_ctl.commit()
    return agent_to_dto(agent, environments)


@router.put("/agents/{agent_id}", response_model=AgentDTO)
@inject
async def update_agent(
    agent_id: str,
    payload: UpdateAgentPayload,
    current_user: FromDishka[AuthorizedUser],
    access_service: FromDishka[AccessService],
    platform_service: FromDishka[PlatformService],
    uow_ctl: FromDishka[UoWCtl],
) -> AgentDTO:
    agent = await platform_service.session.get(Agent, agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    await access_service.require_project_member(
        agent.project_id,
        user_id=current_user.id,
    )
    agent, environments = await platform_service.update_agent(
        agent=agent,
        name=payload.name,
        safe_install=payload.safe_install,
        environment_ids=payload.environment_ids,
    )
    await uow_ctl.commit()
    return agent_to_dto(agent, environments)


@router.delete("/agents/{agent_id}", status_code=204)
@inject
async def delete_agent(
    agent_id: str,
    current_user: FromDishka[AuthorizedUser],
    access_service: FromDishka[AccessService],
    platform_service: FromDishka[PlatformService],
    uow_ctl: FromDishka[UoWCtl],
) -> None:
    agent = await platform_service.session.get(Agent, agent_id)
    if agent is None:
        return
    await access_service.require_project_member(
        agent.project_id,
        user_id=current_user.id,
    )
    await platform_service.delete_agent(agent_id)
    await uow_ctl.commit()


@router.get("/agents/{agent_id}/install-script", response_model=InstallScriptDTO)
@inject
async def get_install_script(
    agent_id: str,
    request: Request,
    config: FromDishka[ConfigHack],
    current_user: FromDishka[AuthorizedUser],
    access_service: FromDishka[AccessService],
    platform_service: FromDishka[PlatformService],
    uow_ctl: FromDishka[UoWCtl],
) -> InstallScriptDTO:
    agent = await platform_service.session.get(Agent, agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    await access_service.require_project_member(
        agent.project_id,
        user_id=current_user.id,
    )
    try:
        platform = normalize_install_platform(agent.declared_os)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    resolved_agent_id, raw_token = await platform_service.issue_install_script(
        agent=agent,
    )
    script_url = _public_agent_url(
        str(
            request.url_for(
                "get_agent_install_script_payload",
                platform=platform,
                bootstrap_token=raw_token,
            )
        ),
        config=config,
    )
    command = install_command_for_script(platform=platform, script_url=script_url)
    await uow_ctl.commit()
    return InstallScriptDTO(
        command=command,
        agent_id=resolved_agent_id,
        safe_install=agent.safe_install,
        platform=platform,
        script_kind=script_kind_for_platform(platform),
        script_url=script_url,
    )


@router.get(
    "/agent-install/{platform}/{bootstrap_token}",
    response_class=PlainTextResponse,
    response_model=None,
    name="get_agent_install_script_payload",
)
@inject
async def get_agent_install_script_payload(
    platform: str,
    bootstrap_token: str,
    request: Request,
    config: FromDishka[ConfigHack],
    platform_service: FromDishka[PlatformService],
) -> PlainTextResponse:
    try:
        normalized_platform = parse_install_platform(platform)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    token_hash = hash_secret(bootstrap_token)
    agent = await platform_service.session.scalar(
        select(Agent)
        .join(AgentBootstrapToken, AgentBootstrapToken.agent_id == Agent.id)
        .where(
            AgentBootstrapToken.token_hash == token_hash,
            AgentBootstrapToken.revoked_at.is_(None),
        )
    )
    if agent is None:
        raise HTTPException(status_code=404, detail="Install script token not found")
    api_url = _public_agent_url(
        str(request.base_url).rstrip("/"),
        config=config,
    )
    artifact_root_url = _public_agent_url(
        str(
            request.url_for(
                "download_agent_artifact",
                platform=normalized_platform,
                arch="ARCH_PLACEHOLDER",
                filename="FILE_PLACEHOLDER",
            )
        ),
        config=config,
    )
    artifact_root_url = artifact_root_url.removesuffix("/ARCH_PLACEHOLDER/FILE_PLACEHOLDER")
    content = render_install_script(
        platform=normalized_platform,
        api_url=api_url,
        bootstrap_token=bootstrap_token,
        artifact_root_url=artifact_root_url,
        safe_install=agent.safe_install,
    )
    return PlainTextResponse(content, media_type="text/plain; charset=utf-8")


@router.get(
    "/agent-artifacts/{platform}/{arch}/{filename}",
    name="download_agent_artifact",
    response_class=FileResponse,
    response_model=None,
)
@inject
async def download_agent_artifact(
    platform: str,
    arch: str,
    filename: str,
    config: FromDishka[ConfigHack],
) -> FileResponse:
    try:
        normalized_platform = parse_install_platform(platform)
        expected_path = artifact_relative_path(platform=normalized_platform, arch=arch)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    if expected_path.name != filename:
        raise HTTPException(status_code=404, detail="Artifact not found")

    base_dir = Path(config.server.agent_artifacts_dir).resolve()
    artifact_path = (base_dir / expected_path).resolve()
    if base_dir not in artifact_path.parents and artifact_path != base_dir:
        raise HTTPException(status_code=404, detail="Artifact not found")
    if not artifact_path.is_file():
        raise HTTPException(status_code=404, detail="Artifact not found")

    media_type = "application/octet-stream"
    return FileResponse(
        artifact_path,
        media_type=media_type,
        filename=artifact_path.name,
    )


@router.get("/agents/{agent_id}/task-runs", response_model=list[TaskRunDTO])
@inject
async def list_agent_task_runs(
    agent_id: str,
    current_user: FromDishka[AuthorizedUser],
    access_service: FromDishka[AccessService],
    platform_service: FromDishka[PlatformService],
) -> list[TaskRunDTO]:
    agent = await platform_service.session.get(Agent, agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    await access_service.require_project_member(
        agent.project_id,
        user_id=current_user.id,
    )
    task_runs = await platform_service.list_agent_task_runs(agent_id)
    return [task_run_to_dto(task_run) for task_run in task_runs]
