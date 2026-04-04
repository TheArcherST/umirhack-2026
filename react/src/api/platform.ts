import apiClient from './client'
import type {
    Agent,
    AssignEnvRolePayload,
    AuthResponse,
    CreateAgentPayload,
    CreateEnvironmentPayload,
    CreateProjectPayload,
    CreateTaskPayload,
    CreateTaskPayloadV2,
    Environment,
    EnvMemberAssignment,
    GraphEdge,
    Host,
    HostInfo,
    InstallScript,
    InviteMemberPayload,
    ListAgentsParams,
    ListTasksParams,
    MetricSnapshot,
    PaginatedResponse,
    Project,
    ProjectMember,
    ServiceInfo,
    PortInfo,
    Stats,
    Task,
    TaskDetail,
    TaskResult,
    TelemetryRecord,
    UpdateAgentPayload,
    UserSearchResult,
    TaskTemplate,
    ScheduleRule,
    TaskTemplateItem,
    EndpointSuggestion,
} from './types'

type AgentApi = {
    id: string
    project_id: string
    name: string
    declared_os: string | null
    safe_install: boolean
    max_concurrent_tasks: number
    status: string
    last_seen_at: string | null
    agent_version: string | null
    reported_agent_version: string | null
    environments: Environment[]
    created_at: string
}

type HostApi = {
    id: string
    environment_id: string
    agent_id: string
    name: string
    hostname: string | null
    os_name: string | null
    status: string
    primary_ipv4: string | null
    primary_ipv6: string | null
    last_seen_at: string | null
    freshness: string | null
    descriptive_fields: Record<string, unknown>
}

type HostDetailApi = {
    id: string
    environment_id: string
    agent_id: string
    kind: string
    name: string
    internal_identifier: string
    descriptive_fields: Record<string, unknown>
    hostname: string | null
    os_name: string | null
    primary_ipv4: string | null
    primary_ipv6: string | null
    metadata_last_refreshed_at: string | null
}

type TaskRunApi = {
    id: string
    environment_id: string
    host_id: string
    agent_id: string
    task_template_id: string
    status: string
    attempt_no: number
    queued_at: string
    started_at: string | null
    finished_at: string | null
    failure_reason: string | null
    command: string
    task_name: string
    task_kind: string
    host_name: string
    agent_name: string
}

type TaskResultApi = {
    task_run_id: string
    exit_code: number | null
    stdout_text: string | null
    stderr_text: string | null
    summary_json: Record<string, unknown> | null
    created_at: string
}

type TelemetryApi = {
    id: string
    task_run_id: string
    host_id: string
    environment_id: string
    kind: string
    schema_version: number
    collected_at: string
    payload_json: Record<string, any>
}

type MetricApi = {
    id: string
    host_id: string
    environment_id: string
    metric_kind: string
    computed_at: string
    value_json: Record<string, any>
}

type TaskTemplateApi = {
    id: string
    project_id: string
    kind: string
    schema_version: number
    name: string
    payload_json: Record<string, any>
    metric_policy_json: Record<string, any>
    approved_command: string | null
    created_at: string
}

const CURRENT_PROJECT_KEY = 'currentProjectId'

type StructuredServiceTelemetry = {
    services?: Array<{
        name?: unknown
        status?: unknown
        active_state?: unknown
        sub_state?: unknown
    }>
}

type StructuredPortScanTelemetry = {
    ports?: Array<{
        port?: unknown
        protocol?: unknown
        service?: unknown
        state?: unknown
    }>
    sample?: unknown
}

function currentProjectId(): string | null {
    return localStorage.getItem(CURRENT_PROJECT_KEY)
}

function mapTaskStatus(status: string): Task['status'] {
    if (status === 'running') return 'running'
    if (status === 'succeeded') return 'success'
    if (status === 'failed' || status === 'cancelled') return 'failed'
    if (status === 'expired') return 'timeout'
    return 'pending'
}

function secondsBetween(startedAt: string | null, finishedAt: string | null): number | null {
    if (!startedAt || !finishedAt) return null
    return Math.max(0, (new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000)
}

function parsePort(value: unknown): number | undefined {
    const normalized = String(value ?? '').trim()
    if (!normalized) return undefined
    const direct = Number(normalized)
    if (Number.isFinite(direct) && direct > 0) return direct
    const match = normalized.match(/(?::|\.)(\d+)$/)
    if (!match) return undefined
    const parsed = Number(match[1])
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

const HTTP_PORTS = new Set([80, 81, 3000, 4173, 5000, 5173, 8000, 8008, 8080, 8081, 8888])
const HTTPS_PORTS = new Set([443, 444, 8443, 9443])

function normalizePortProtocol(value: unknown): PortInfo['protocol'] {
    return String(value ?? '').toLowerCase().startsWith('udp') ? 'udp' : 'tcp'
}

function normalizePortState(value: unknown): PortInfo['state'] {
    const normalized = String(value ?? '').toLowerCase()
    if (normalized.includes('listen')) return 'listening'
    return 'established'
}

function normalizeServiceStatus(entry: {
    status?: unknown
    active_state?: unknown
    sub_state?: unknown
}): ServiceInfo['status'] {
    const status = String(entry.status ?? '').toLowerCase()
    const activeState = String(entry.active_state ?? '').toLowerCase()
    const subState = String(entry.sub_state ?? '').toLowerCase()
    if (
        status === 'running' ||
        activeState === 'active' ||
        subState === 'running' ||
        subState === 'listening' ||
        subState === 'start_pending'
    ) {
        return 'running'
    }
    return 'stopped'
}

function mapStructuredServices(
    payload: StructuredServiceTelemetry | undefined,
): ServiceInfo[] {
    if (!Array.isArray(payload?.services)) return []

    const byName = new Map<string, ServiceInfo>()
    for (const entry of payload.services) {
        const name = String(entry?.name ?? '').trim()
        if (!name) continue
        byName.set(name, {
            name,
            status: normalizeServiceStatus(entry ?? {}),
            known: false,
        })
    }
    return Array.from(byName.values()).sort((left, right) => left.name.localeCompare(right.name))
}

function parseLinuxPortScanSample(sample: string): PortInfo[] {
    const ports = new Map<string, PortInfo>()
    for (const line of sample.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('Netid ') || trimmed.startsWith('State ')) continue
        const parts = trimmed.split(/\s+/)
        if (parts.length < 5) continue
        const protocol = normalizePortProtocol(parts[0])
        const state = normalizePortState(parts[1])
        const port = parsePort(parts[4])
        if (port == null) continue
        const key = `${protocol}:${port}`
        if (!ports.has(key)) {
            ports.set(key, { port, protocol, state })
        }
    }
    return Array.from(ports.values()).sort((left, right) => left.port - right.port)
}

function parseMacosPortScanSample(sample: string): PortInfo[] {
    const ports = new Map<string, PortInfo>()
    for (const line of sample.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('COMMAND ')) continue
        const parts = trimmed.split(/\s+/)
        if (parts.length < 9) continue
        const protocol = normalizePortProtocol(parts[7])
        const port = parsePort(parts[8])
        if (port == null) continue
        const key = `${protocol}:${port}`
        if (!ports.has(key)) {
            ports.set(key, {
                port,
                protocol,
                state: 'listening',
            })
        }
    }
    return Array.from(ports.values()).sort((left, right) => left.port - right.port)
}

function parseWindowsPortScanSample(sample: string): PortInfo[] {
    const ports = new Map<string, PortInfo>()
    for (const line of sample.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || /^(Proto|Active Connections)/i.test(trimmed)) continue
        const parts = trimmed.split(/\s+/)
        if (parts.length < 4) continue
        const protocol = normalizePortProtocol(parts[0])
        const port = parsePort(parts[1])
        if (port == null) continue
        const state = protocol === 'udp' ? 'listening' : normalizePortState(parts[3])
        const key = `${protocol}:${port}`
        if (!ports.has(key)) {
            ports.set(key, { port, protocol, state })
        }
    }
    return Array.from(ports.values()).sort((left, right) => left.port - right.port)
}

function parsePortScanSample(sample: unknown): PortInfo[] {
    const normalized = String(sample ?? '').trim()
    if (!normalized) return []
    if (normalized.includes('Netid') && normalized.includes('Local Address:Port')) {
        return parseLinuxPortScanSample(normalized)
    }
    if (normalized.includes('COMMAND') && normalized.includes('NODE') && normalized.includes('NAME')) {
        return parseMacosPortScanSample(normalized)
    }
    if (normalized.includes('Active Connections') || normalized.includes('Proto')) {
        return parseWindowsPortScanSample(normalized)
    }
    return []
}

function mapStructuredPorts(
    payload: StructuredPortScanTelemetry | undefined,
): PortInfo[] {
    if (Array.isArray(payload?.ports)) {
        const bySocket = new Map<string, PortInfo>()
        for (const entry of payload.ports) {
            const port = parsePort(entry?.port)
            if (port == null) continue
            const protocol = normalizePortProtocol(entry?.protocol)
            const key = `${protocol}:${port}`
            bySocket.set(key, {
                port,
                protocol,
                service: entry?.service ? String(entry.service) : undefined,
                state: normalizePortState(entry?.state),
            })
        }
        return Array.from(bySocket.values()).sort((left, right) => left.port - right.port)
    }

    return parsePortScanSample(payload?.sample)
}

function registerEndpointSuggestion(
    suggestions: Map<string, EndpointSuggestion>,
    suggestion: EndpointSuggestion,
): void {
    const value = suggestion.value.trim()
    if (!value) return
    const key = value.toLowerCase()
    if (suggestions.has(key)) return
    suggestions.set(key, {
        ...suggestion,
        value,
        label: suggestion.label.trim() || value,
        source: suggestion.source.trim(),
    })
}

function hostEndpointAliases(host: Host): string[] {
    return Array.from(
        new Set(
            [
                host.hostname,
                host.primary_ipv4,
                host.primary_ipv6,
                host.name,
            ]
                .map((value) => String(value ?? '').trim())
                .filter(Boolean),
        ),
    )
}

function isHttpsPort(port: PortInfo): boolean {
    const service = String(port.service ?? '').toLowerCase()
    return HTTPS_PORTS.has(port.port) || service.includes('https') || service.includes('tls')
}

function isHttpPort(port: PortInfo): boolean {
    const service = String(port.service ?? '').toLowerCase()
    return HTTP_PORTS.has(port.port) || service.includes('http') || service.includes('web')
}

function endpointSuggestionRank(kind: EndpointSuggestion['kind']): number {
    if (kind === 'host') return 0
    if (kind === 'url') return 1
    if (kind === 'socket') return 2
    return 3
}

export function kindToTemplate(kind: string): TaskTemplate {
    const map: Record<string, TaskTemplate> = {
        'host.system_profile': 'system_info',
        'host.ip_interfaces': 'network_interfaces',
        'network.endpoint_connectivity': 'ping',
        'agent.self_update': 'self_update',
        'diagnostic.command.custom': 'custom_command',
        'diagnostic.command.port_scan': 'port_scan',
        'diagnostic.command.disk_usage': 'disk_usage',
        'diagnostic.command.memory_cpu': 'memory_cpu',
        'diagnostic.command.service_status': 'service_status',
        'diagnostic.command.system_logs': 'system_logs',
    }
    return map[kind] ?? 'system_info'
}

function templateToKind(template: TaskTemplate): string {
    const map: Record<TaskTemplate, string> = {
        ping: 'network.endpoint_connectivity',
        system_info: 'host.system_profile',
        network_interfaces: 'host.ip_interfaces',
        self_update: 'agent.self_update',
        custom_command: 'diagnostic.command.custom',
        port_scan: 'diagnostic.command.port_scan',
        disk_usage: 'diagnostic.command.disk_usage',
        memory_cpu: 'diagnostic.command.memory_cpu',
        service_status: 'diagnostic.command.service_status',
        system_logs: 'diagnostic.command.system_logs',
    }
    return map[template]
}

function mapAgent(row: AgentApi): Agent {
    return {
        id: row.id,
        name: row.name,
        hostname: null,
        ip_address: '',
        os: normalizeAgentOs(row.declared_os ?? ''),
        status: row.status as Agent['status'],
        last_heartbeat: row.last_seen_at,
        tasks_count: 0,
        environment_ids: row.environments.map((env) => env.id),
        safe_install: row.safe_install,
        max_concurrent_tasks: row.max_concurrent_tasks,
        agent_version: row.agent_version,
        reported_agent_version: row.reported_agent_version,
        created_at: row.created_at,
        environment_names: row.environments.map((env) => ({ id: env.id, name: env.name })),
    }
}

function normalizeAgentOs(value: string): Agent['os'] {
    const lowered = value.toLowerCase()
    if (lowered.includes('win')) return 'windows'
    if (lowered.includes('mac')) return 'macos'
    return 'linux'
}

function mapHost(row: HostApi): Host {
    return {
        id: row.id,
        environment_id: row.environment_id,
        agent_id: row.agent_id,
        name: row.name,
        hostname: row.hostname,
        os_name: row.os_name,
        status: row.status as Host['status'],
        primary_ipv4: row.primary_ipv4,
        primary_ipv6: row.primary_ipv6,
        last_seen_at: row.last_seen_at,
        freshness: row.freshness,
        descriptive_fields: row.descriptive_fields ?? {},
    }
}

function mapTask(row: TaskRunApi): Task {
    return {
        id: row.id,
        agent_id: row.agent_id,
        agent_name: row.agent_name,
        host_id: row.host_id,
        host_name: row.host_name,
        environment_id: row.environment_id,
        command: row.command,
        status: mapTaskStatus(row.status),
        timeout: 60,
        duration: secondsBetween(row.started_at, row.finished_at),
        started_at: row.started_at,
        completed_at: row.finished_at,
        created_at: row.queued_at,
        template: kindToTemplate(row.task_kind),
    }
}

async function fetchProjectId(): Promise<string> {
    const existing = currentProjectId()
    if (existing) return existing
    const projects = await stubGetProjects()
    if (projects.length === 0) throw new Error('No projects found')
    localStorage.setItem(CURRENT_PROJECT_KEY, projects[0].id)
    return projects[0].id
}

async function getTaskTemplatesInternal(projectId?: string): Promise<TaskTemplateApi[]> {
    const resolvedProjectId = projectId ?? await fetchProjectId()
    const { data } = await apiClient.get<TaskTemplateApi[]>('/task-templates', {
        params: { project_id: resolvedProjectId },
    })
    return data
}

export async function stubGetProjects(): Promise<Project[]> {
    const { data } = await apiClient.get<Project[]>('/projects')
    return data
}

export async function stubGetProject(projectId: string): Promise<Project | null> {
    const projects = await stubGetProjects()
    return projects.find((project) => project.id === projectId) ?? null
}

export async function stubCreateProject(payload: CreateProjectPayload): Promise<Project> {
    const { data } = await apiClient.post<Project>('/projects', payload)
    return data
}

export async function stubGetEnvironments(projectId: string): Promise<Environment[]> {
    const resolvedProjectId = projectId || await fetchProjectId()
    const { data } = await apiClient.get<Environment[]>('/environments', {
        params: { project_id: resolvedProjectId },
    })
    return data
}

export async function stubCreateEnvironment(payload: CreateEnvironmentPayload): Promise<Environment> {
    const { data } = await apiClient.post<Environment>('/environments', payload)
    return data
}

export async function stubDeleteEnvironment(_envId: string): Promise<void> {
    throw new Error('Environment deletion is not implemented in the rewritten control plane')
}

export async function stubGetProjectMembers(projectId: string): Promise<ProjectMember[]> {
    const { data } = await apiClient.get<ProjectMember[]>(`/projects/${projectId}/members`)
    return data
}

export async function stubInviteMember(payload: InviteMemberPayload): Promise<ProjectMember> {
    const { data } = await apiClient.post<ProjectMember>(
        `/projects/${payload.project_id}/members/invite`,
        { email: payload.email },
    )
    return data
}

export async function stubRemoveMember(userId: string): Promise<void> {
    const projectId = await fetchProjectId()
    await apiClient.delete(`/projects/${projectId}/members/${userId}`)
}

export async function stubUpdateProjectRole(userId: string, role: string): Promise<ProjectMember> {
    const projectId = await fetchProjectId()
    const mappedRole = role === 'admin' ? 'admin' : 'member'
    const { data } = await apiClient.put<ProjectMember>(
        `/projects/${projectId}/members/${userId}/role`,
        { role: mappedRole },
    )
    return data
}

export async function stubAssignEnvRole(payload: AssignEnvRolePayload): Promise<EnvMemberAssignment> {
    const { data } = await apiClient.post<EnvMemberAssignment>(
        `/environments/${payload.env_id}/members/${payload.user_id}/role`,
        { role: payload.role },
    )
    return data
}

export async function stubGetEnvMembers(envId: string): Promise<EnvMemberAssignment[]> {
    const { data } = await apiClient.get<EnvMemberAssignment[]>(`/environments/${envId}/members`)
    return data
}

export async function stubGetAgents(params?: ListAgentsParams): Promise<Agent[]> {
    const projectId = await fetchProjectId()
    const { data } = await apiClient.get<AgentApi[]>('/agents', {
        params: {
            project_id: projectId,
            environment_id: params?.environment_id,
            status: params?.status || undefined,
        },
    })
    const agents = data.map(mapAgent)

    if (params?.environment_id) {
        const hosts = await stubGetHosts(params.environment_id)
        const hostByAgentId = new Map(hosts.map((host) => [host.agent_id, host]))
        return agents.map((agent) => {
            const host = hostByAgentId.get(agent.id)
            return {
                ...agent,
                hostname: host?.hostname ?? agent.hostname,
                ip_address: host?.primary_ipv4 ?? host?.primary_ipv6 ?? '',
            }
        })
    }

    return agents
}

export async function stubCreateAgent(payload: CreateAgentPayload): Promise<{ agent: Agent; installScript: InstallScript }> {
    const projectId = await fetchProjectId()
    const { data } = await apiClient.post<AgentApi>('/agents', {
        project_id: projectId,
        name: payload.name,
        declared_os: payload.os,
        safe_install: payload.safe_install ?? false,
        max_concurrent_tasks: payload.max_concurrent_tasks ?? 4,
        agent_version: payload.agent_version,
        environment_ids: payload.environment_ids ?? [],
    })
    const installScript = await stubGetAgentInstallScript(data.id)
    return {
        agent: mapAgent(data),
        installScript,
    }
}

export async function stubUpdateAgent(id: string, payload: UpdateAgentPayload): Promise<Agent> {
    const { data } = await apiClient.put<AgentApi>(`/agents/${id}`, {
        name: payload.name,
        safe_install: payload.safe_install,
        max_concurrent_tasks: payload.max_concurrent_tasks,
        agent_version: payload.agent_version,
        environment_ids: payload.environment_ids,
    })
    return mapAgent(data)
}

export async function stubDeleteAgent(id: string): Promise<void> {
    await apiClient.delete(`/agents/${id}`)
}

export async function stubDeleteHost(id: string): Promise<void> {
    await apiClient.delete(`/hosts/${id}`)
}

export async function stubGetAgentInstallScript(id: string): Promise<InstallScript> {
    const { data } = await apiClient.get<InstallScript>(`/agents/${id}/install-script`)
    return data
}

export async function stubGetHosts(envId: string): Promise<Host[]> {
    const { data } = await apiClient.get<HostApi[]>(`/environments/${envId}/hosts`)
    return data.map(mapHost)
}

export async function stubGetHost(hostId: string): Promise<Host | null> {
    const detail = await apiClient.get<HostDetailApi>(`/hosts/${hostId}`)
    const [telemetry, hostsResponse] = await Promise.all([
        apiClient.get<TelemetryApi[]>(`/hosts/${hostId}/telemetry`),
        apiClient.get<HostApi[]>(
            `/environments/${detail.data.environment_id}/hosts`,
        ),
    ])
    const hostRow = hostsResponse.data.find((row) => row.id === hostId)
    return {
        id: detail.data.id,
        environment_id: detail.data.environment_id,
        agent_id: detail.data.agent_id,
        name: detail.data.name,
        hostname: detail.data.hostname,
        os_name: detail.data.os_name,
        status: hostRow ? (hostRow.status as Host['status']) : 'offline',
        primary_ipv4: detail.data.primary_ipv4,
        primary_ipv6: detail.data.primary_ipv6,
        last_seen_at: hostRow?.last_seen_at ?? null,
        freshness: telemetry.data[0]?.collected_at ?? detail.data.metadata_last_refreshed_at,
        descriptive_fields: detail.data.descriptive_fields,
    }
}

export async function stubGetEnvironmentGraph(envId: string): Promise<GraphEdge[]> {
    const { data } = await apiClient.get<GraphEdge[]>(`/environments/${envId}/graph`)
    return data
}

export async function stubGetEnvironmentEndpointSuggestions(
    envId: string,
): Promise<EndpointSuggestion[]> {
    const [hosts, graphEdges] = await Promise.all([
        stubGetHosts(envId),
        stubGetEnvironmentGraph(envId),
    ])
    const portsByHost = await Promise.all(
        hosts.map(async (host) => {
            try {
                return [host.id, await stubGetHostPorts(host.id)] as const
            } catch {
                return [host.id, []] as const
            }
        }),
    )

    const hostById = new Map(hosts.map((host) => [host.id, host]))
    const hostPorts = new Map(portsByHost)
    const suggestions = new Map<string, EndpointSuggestion>()

    for (const host of hosts) {
        for (const alias of hostEndpointAliases(host)) {
            registerEndpointSuggestion(suggestions, {
                value: alias,
                label: alias,
                source: host.name,
                kind: 'host',
                host_id: host.id,
            })
        }
    }

    for (const edge of graphEdges) {
        if (!edge.target_host_id || !edge.target_label || edge.status !== 'reachable') continue
        const targetHost = hostById.get(edge.target_host_id)
        registerEndpointSuggestion(suggestions, {
            value: edge.target_label,
            label: edge.target_label,
            source: targetHost ? `${targetHost.name} observed` : 'Observed in environment',
            kind: 'observed',
            host_id: edge.target_host_id,
        })
    }

    for (const host of hosts) {
        const listeningPorts = (hostPorts.get(host.id) ?? []).filter((port) => port.state === 'listening')
        if (listeningPorts.length === 0) continue

        for (const port of listeningPorts) {
            const aliases = hostEndpointAliases(host)
            const protocolLabel = `${port.protocol.toUpperCase()}/${port.port}`
            for (const alias of aliases) {
                registerEndpointSuggestion(suggestions, {
                    value: `${alias}:${port.port}`,
                    label: `${alias}:${port.port}`,
                    source: `${host.name} ${protocolLabel}`,
                    kind: 'socket',
                    host_id: host.id,
                })

                if (port.protocol !== 'tcp') continue
                if (isHttpPort(port)) {
                    registerEndpointSuggestion(suggestions, {
                        value: `http://${alias}:${port.port}`,
                        label: `http://${alias}:${port.port}`,
                        source: `${host.name} HTTP`,
                        kind: 'url',
                        host_id: host.id,
                    })
                    if (port.port === 80) {
                        registerEndpointSuggestion(suggestions, {
                            value: `http://${alias}`,
                            label: `http://${alias}`,
                            source: `${host.name} HTTP`,
                            kind: 'url',
                            host_id: host.id,
                        })
                    }
                }
                if (isHttpsPort(port)) {
                    registerEndpointSuggestion(suggestions, {
                        value: `https://${alias}:${port.port}`,
                        label: `https://${alias}:${port.port}`,
                        source: `${host.name} HTTPS`,
                        kind: 'url',
                        host_id: host.id,
                    })
                    if (port.port === 443) {
                        registerEndpointSuggestion(suggestions, {
                            value: `https://${alias}`,
                            label: `https://${alias}`,
                            source: `${host.name} HTTPS`,
                            kind: 'url',
                            host_id: host.id,
                        })
                    }
                }
            }
        }
    }

    return Array.from(suggestions.values()).sort((left, right) => {
        const rankDelta = endpointSuggestionRank(left.kind) - endpointSuggestionRank(right.kind)
        if (rankDelta !== 0) return rankDelta
        return left.label.localeCompare(right.label)
    })
}

export async function stubGetHostInfo(hostId: string): Promise<HostInfo | null> {
    const [hostResponse, telemetryResponse] = await Promise.all([
        apiClient.get<HostDetailApi>(`/hosts/${hostId}`),
        apiClient.get<TelemetryApi[]>(`/hosts/${hostId}/telemetry`),
    ])

    const host = hostResponse.data
    const telemetry = telemetryResponse.data
    const system = telemetry.find((item) => item.kind === 'host.system_profile')
    const interfaces = telemetry.find((item) => item.kind === 'host.ip_interfaces')
    const ifaceList = interfaces?.payload_json.interfaces ?? []
    const ipAddresses = ifaceList.flatMap((iface: any) => [...(iface.ipv4 ?? []), ...(iface.ipv6 ?? [])])

    return {
        hostname: host.hostname ?? host.name,
        os_name: host.os_name ?? system?.payload_json.os_name ?? 'Unknown',
        os_version: String(system?.payload_json.platform_version ?? 'n/a'),
        kernel: String(system?.payload_json.kernel ?? 'n/a'),
        interfaces: ifaceList.map((iface: any) => ({
            name: iface.name,
            mac: iface.mac ?? 'n/a',
            ipv4: iface.ipv4 ?? [],
            ipv6: iface.ipv6 ?? [],
        })),
        ip_addresses: ipAddresses,
        uptime: 'discovered via telemetry',
        cpu_model: 'not collected',
        cpu_cores: 0,
        memory_total_mb: 0,
    }
}

export async function stubGetHostServices(hostId: string): Promise<{ services: ServiceInfo[]; ports: PortInfo[] }> {
    const telemetry = await apiClient.get<TelemetryApi[]>(`/hosts/${hostId}/telemetry`)
    const latestServiceStatus = telemetry.data.find((item) => item.kind === 'diagnostic.command.service_status')
    const latestPortScan = telemetry.data.find((item) => item.kind === 'diagnostic.command.port_scan')
    const structuredServices = mapStructuredServices(latestServiceStatus?.payload_json as StructuredServiceTelemetry | undefined)
    const ports = mapStructuredPorts(latestPortScan?.payload_json as StructuredPortScanTelemetry | undefined)
    const services = structuredServices
    return { services, ports }
}

export async function stubGetHostPorts(hostId: string): Promise<PortInfo[]> {
    const { ports } = await stubGetHostServices(hostId)
    return ports
}

export async function stubGetHostTelemetry(hostId: string): Promise<TelemetryRecord[]> {
    const { data } = await apiClient.get<TelemetryApi[]>(`/hosts/${hostId}/telemetry`)
    return data.map((row) => ({
        id: row.id,
        task_run_id: row.task_run_id,
        host_id: row.host_id,
        environment_id: row.environment_id,
        kind: row.kind,
        schema_version: row.schema_version,
        collected_at: row.collected_at,
        payload_json: row.payload_json,
    }))
}

export async function stubGetHostMetrics(hostId: string): Promise<MetricSnapshot[]> {
    const { data } = await apiClient.get<MetricApi[]>(`/hosts/${hostId}/metrics`)
    return data.map((row) => ({
        id: row.id,
        host_id: row.host_id,
        environment_id: row.environment_id,
        metric_kind: row.metric_kind,
        computed_at: row.computed_at,
        value_json: row.value_json,
    }))
}

async function listAllEnvironmentTaskRuns(): Promise<TaskRunApi[]> {
    const environments = await stubGetEnvironments('')
    const perEnv = await Promise.all(
        environments.map(async (env) => {
            const { data } = await apiClient.get<TaskRunApi[]>(`/environments/${env.id}/task-runs`)
            return data
        }),
    )
    return perEnv.flat().sort(
        (left, right) => new Date(right.queued_at).getTime() - new Date(left.queued_at).getTime(),
    )
}

export async function stubGetRecentTasks(limit = 8): Promise<Task[]> {
    const runs = await listAllEnvironmentTaskRuns()
    return runs.slice(0, limit).map(mapTask)
}

export async function stubGetTasks(params?: ListTasksParams): Promise<PaginatedResponse<Task>> {
    let runs: TaskRunApi[] = []
    if (params?.agent_id) {
        const { data } = await apiClient.get<TaskRunApi[]>(`/agents/${params.agent_id}/task-runs`)
        runs = data
    } else {
        runs = await listAllEnvironmentTaskRuns()
    }

    const filtered = runs
        .map(mapTask)
        .filter((task) => !params?.status || task.status === params.status)

    const page = params?.page ?? 1
    const perPage = params?.per_page ?? 20
    const start = (page - 1) * perPage
    const items = filtered.slice(start, start + perPage)
    return {
        items,
        total: filtered.length,
        page,
        per_page: perPage,
        total_pages: Math.max(1, Math.ceil(filtered.length / perPage)),
    }
}

export async function stubGetTask(taskId: string): Promise<TaskDetail> {
    const [taskResponse, resultResponse] = await Promise.allSettled([
        apiClient.get<TaskRunApi>(`/task-runs/${taskId}`),
        apiClient.get<TaskResultApi>(`/task-runs/${taskId}/result`),
    ])

    if (taskResponse.status !== 'fulfilled') {
        throw new Error('Task not found')
    }

    const task = mapTask(taskResponse.value.data)
    let result: TaskResult | null = null
    if (resultResponse.status === 'fulfilled') {
        const row = resultResponse.value.data
        result = {
            id: row.task_run_id,
            task_id: row.task_run_id,
            exit_code: row.exit_code ?? 0,
            stdout: row.stdout_text ?? '',
            stderr: row.stderr_text ?? '',
            duration: task.duration ?? 0,
        }
    }

    return {
        ...task,
        result,
    }
}

export async function stubCreateTask(payload: CreateTaskPayload): Promise<Task> {
    return stubCreateTaskV2({
        agent_id: payload.agent_id,
        template: 'custom_command',
        command: payload.command,
    })
}

async function listHostsForAgent(agentId: string): Promise<Host[]> {
    const environments = await stubGetEnvironments('')
    const perEnv = await Promise.all(
        environments.map((env) => stubGetHosts(env.id)),
    )
    return perEnv.flat().filter((host) => host.agent_id === agentId)
}

export async function stubCreateTaskV2(payload: CreateTaskPayloadV2): Promise<Task> {
    const projectId = await fetchProjectId()
    const templates = await getTaskTemplatesInternal(projectId)
    const targetKind = templateToKind(payload.template)
    const template =
        templates.find((item) => item.kind === targetKind) ??
        templates.find((item) => item.kind === 'diagnostic.command') ??
        templates[0]
    if (!template) throw new Error('No task templates are available')

    const host = payload.environment_id
        ? (await stubGetHosts(payload.environment_id)).find((row) => row.agent_id === payload.agent_id)
        : (await listHostsForAgent(payload.agent_id))[0]
    if (!host) throw new Error('Selected agent is not attached to any environment')

    const { data } = await apiClient.post<TaskRunApi[]>('/task-runs', {
        environment_id: host.environment_id,
        host_ids: [host.id],
        task_template_id: template.id,
        payload_overrides:
            payload.template === 'custom_command'
                ? { approved_command: payload.command?.trim() ?? '' }
                : payload.template === 'self_update'
                    ? {}
                : payload.target
                    ? { target_endpoint: payload.target }
                    : undefined,
    })
    return mapTask(data[0])
}

export async function stubGetStats(): Promise<Stats> {
    const [agents, tasks] = await Promise.all([stubGetAgents(), stubGetRecentTasks(200)])
    return {
        total_agents: agents.length,
        online_agents: agents.filter((agent) => agent.status === 'online').length,
        tasks_today: tasks.length,
        successful_tasks: tasks.filter((task) => task.status === 'success').length,
        failed_tasks: tasks.filter((task) => task.status === 'failed').length,
    }
}

export async function stubSearchUsers(query: string): Promise<UserSearchResult[]> {
    const normalized = query.trim()
    if (normalized.length < 2) {
        return []
    }

    const { data } = await apiClient.get<UserSearchResult[]>('/users/search', {
        params: { q: normalized },
    })
    return data
}

export async function stubGetTaskTemplates(): Promise<TaskTemplateItem[]> {
    const projectId = await fetchProjectId()
    const { data } = await apiClient.get<TaskTemplateItem[]>('/task-templates', {
        params: { project_id: projectId },
    })
    return data
}

export async function stubGetScheduleRules(envId: string): Promise<ScheduleRule[]> {
    const { data } = await apiClient.get<ScheduleRule[]>(`/environments/${envId}/schedule-rules`)
    return data
}

export async function stubPatchScheduleRule(
    id: string,
    patch: {
        is_enabled?: boolean
        cron_expr?: string
        host_ids?: string[]
        approved_command?: string | null
        target_endpoint?: string | null
    },
): Promise<ScheduleRule> {
    const { data } = await apiClient.patch<ScheduleRule>(`/schedule-rules/${id}`, patch)
    return data
}

export async function stubDeleteScheduleRule(id: string): Promise<void> {
    await apiClient.delete(`/schedule-rules/${id}`)
}

export interface CreateCronPayload {
    environment_id: string
    template: TaskTemplate
    cron_expr: string
    host_ids?: string[]
    is_enabled?: boolean
    command?: string
    target?: string
}

export async function stubCreateScheduleRule(payload: CreateCronPayload): Promise<ScheduleRule> {
    const projectId = await fetchProjectId()
    const templates = await getTaskTemplatesInternal(projectId)
    const targetKind = templateToKind(payload.template)
    const template =
        templates.find((item) => item.kind === targetKind) ??
        templates.find((item) => item.kind === 'diagnostic.command') ??
        templates[0]
    if (!template) throw new Error('No task templates are available')

    const body: Record<string, unknown> = {
        environment_id: payload.environment_id,
        task_template_id: template.id,
        cron_expr: payload.cron_expr,
        host_ids: payload.host_ids,
        is_enabled: payload.is_enabled ?? true,
    }
    if (payload.command) body.approved_command = payload.command.trim()
    if (payload.target) body.target_endpoint = payload.target.trim()

    const { data } = await apiClient.post<ScheduleRule>('/schedule-rules', body)
    return data
}
