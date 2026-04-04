export type AgentStatus = 'online' | 'stale' | 'offline'
export type TaskStatus = 'pending' | 'running' | 'success' | 'failed' | 'timeout'
export type MemberRole = 'owner' | 'admin' | 'member' | 'operator' | 'observer'
export type EnvRole = 'operator' | 'observer'
export type AgentOS = 'linux' | 'windows' | 'macos'
export type InviteStatus = 'pending' | 'accepted'

export type TaskTemplate =
    | 'ping'
    | 'system_info'
    | 'network_interfaces'
    | 'self_update'
    | 'custom_command'
    | 'port_scan'
    | 'disk_usage'
    | 'memory_cpu'
    | 'service_status'
    | 'system_logs'

export interface TaskTemplateOption {
    id: TaskTemplate
    labelKey: string
    descriptionKey: string
    requiresTarget?: boolean
    requiresCommand?: boolean
}

export const TASK_TEMPLATES: TaskTemplateOption[] = [
    { id: 'ping',               labelKey: 'taskTemplates.ping',              descriptionKey: 'taskTemplates.pingDesc',              requiresTarget: true },
    { id: 'system_info',        labelKey: 'taskTemplates.systemInfo',        descriptionKey: 'taskTemplates.systemInfoDesc' },
    { id: 'network_interfaces', labelKey: 'taskTemplates.networkInterfaces', descriptionKey: 'taskTemplates.networkInterfacesDesc' },
    { id: 'self_update',        labelKey: 'taskTemplates.selfUpdate',        descriptionKey: 'taskTemplates.selfUpdateDesc' },
    { id: 'custom_command',     labelKey: 'taskTemplates.customCommand',     descriptionKey: 'taskTemplates.customCommandDesc',     requiresCommand: true },
    { id: 'port_scan',          labelKey: 'taskTemplates.portScan',          descriptionKey: 'taskTemplates.portScanDesc' },
    { id: 'disk_usage',         labelKey: 'taskTemplates.diskUsage',         descriptionKey: 'taskTemplates.diskUsageDesc' },
    { id: 'memory_cpu',         labelKey: 'taskTemplates.memoryCpu',         descriptionKey: 'taskTemplates.memoryCpuDesc' },
    { id: 'service_status',     labelKey: 'taskTemplates.serviceStatus',     descriptionKey: 'taskTemplates.serviceStatusDesc' },
    { id: 'system_logs',        labelKey: 'taskTemplates.systemLogs',        descriptionKey: 'taskTemplates.systemLogsDesc' },
]

export interface Project {
    id: string
    name: string
    owner_id: string
    created_at: string
}

export interface Environment {
    id: string
    name: string
    project_id: string
    created_at: string
}

export interface ProjectMember {
    user_id: string
    email: string
    name: string
    role: MemberRole
    status: InviteStatus
    invited_at: string
}

export interface EnvMemberAssignment {
    user_id: string
    env_id: string
    role: EnvRole | 'admin'
}

export interface AgentEnvironmentRef {
    id: string
    name: string
}

export interface Agent {
    id: string
    name: string
    hostname: string | null
    ip_address: string
    os: AgentOS
    status: AgentStatus
    last_heartbeat: string | null
    tasks_count: number
    environment_ids: string[]
    safe_install: boolean
    agent_version: string | null
    reported_agent_version: string | null
    created_at: string
    environment_names?: AgentEnvironmentRef[]
}

export interface Host {
    id: string
    environment_id: string
    agent_id: string
    name: string
    hostname: string | null
    os_name: string | null
    status: AgentStatus
    primary_ipv4: string | null
    primary_ipv6: string | null
    last_seen_at: string | null
    freshness: string | null
    descriptive_fields: Record<string, unknown>
}

export interface HostInfo {
    hostname: string
    os_name: string
    os_version: string
    kernel: string
    interfaces: { name: string; mac: string; ipv4: string[]; ipv6: string[] }[]
    ip_addresses: string[]
    uptime: string
    cpu_model: string
    cpu_cores: number
    memory_total_mb: number
}

export interface ServiceInfo {
    name: string
    status: 'running' | 'stopped'
    port?: number
    known: boolean
}

export interface PortInfo {
    port: number
    protocol: 'tcp' | 'udp'
    service?: string
    state: 'listening' | 'established'
}

export interface TelemetryRecord {
    id: string
    task_run_id: string
    host_id: string
    environment_id: string
    kind: string
    schema_version: number
    collected_at: string
    payload_json: Record<string, any>
}

export interface MetricSnapshot {
    id: string
    host_id: string
    environment_id: string
    metric_kind: string
    computed_at: string
    value_json: Record<string, any>
}

export interface ScheduleRule {
    id: string
    environment_id: string
    task_template_id: string
    cron_expr: string
    target_selector_json: { host_ids?: string[]; target_endpoint?: string; approved_command?: string }
    is_enabled: boolean
    next_run_at: string | null
    created_at: string
    task_name: string
    task_kind: string
}

export interface TaskTemplateItem {
    id: string
    project_id: string
    kind: string
    name: string
    payload_json: Record<string, any>
    approved_command: string | null
    created_at: string
}

export interface CreateScheduleRulePayload {
    environment_id: string
    task_template_id: string
    cron_expr: string
    host_ids?: string[]
    is_enabled?: boolean
}

export interface GraphEdge {
    id: string
    environment_id: string
    source_host_id: string
    target_host_id: string | null
    target_label: string | null
    relation_kind: string
    status: string
    observed_at: string
    expires_at: string | null
    payload_json: Record<string, any>
}

export interface Task {
    id: string
    agent_id: string
    agent_name: string
    host_id: string
    host_name: string
    environment_id: string
    command: string
    template?: TaskTemplate
    status: TaskStatus
    timeout: number
    duration: number | null
    started_at: string | null
    completed_at: string | null
    created_at: string
}

export interface TaskResult {
    id: string
    task_id: string
    exit_code: number
    stdout: string
    stderr: string
    duration: number
}

export interface TaskDetail extends Task {
    result: TaskResult | null
}

export interface Stats {
    total_agents: number
    online_agents: number
    tasks_today: number
    successful_tasks: number
    failed_tasks: number
}

export interface PaginatedResponse<T> {
    items: T[]
    total: number
    page: number
    per_page: number
    total_pages: number
}

export interface CreateTaskPayload {
    agent_id: string
    command: string
    timeout?: number
}

export interface CreateTaskPayloadV2 {
    agent_id: string
    environment_id?: string
    template: TaskTemplate
    target?: string
    command?: string
}

export interface ListTasksParams {
    agent_id?: string
    status?: TaskStatus | ''
    page?: number
    per_page?: number
    date_from?: string
    date_to?: string
}

export interface ListAgentsParams {
    status?: AgentStatus | ''
    environment_id?: string
}

export interface CreateProjectPayload {
    name: string
}

export interface CreateEnvironmentPayload {
    name: string
    project_id: string
}

export interface CreateAgentPayload {
    name: string
    os: AgentOS
    safe_install?: boolean
    agent_version?: string
    environment_ids?: string[]
}

export interface UpdateAgentPayload {
    name?: string
    safe_install?: boolean
    agent_version?: string
    environment_ids?: string[]
}

export interface InviteMemberPayload {
    project_id: string
    email: string
}

export interface AssignEnvRolePayload {
    user_id: string
    env_id: string
    role: EnvRole
}

export interface InstallScript {
    command: string
    agent_id: string
    version: string
    safe_install: boolean
    platform: 'linux' | 'macos' | 'windows'
    script_kind: 'bash' | 'powershell'
    script_url: string
}

export interface UserSearchResult {
    user_id: string
    email: string
    name: string
}

export interface LoginPayload {
    username: string
    password: string
}

export interface LoginResponse {
    token: string
    user: AuthUser
}

export interface RegisterPayload {
    username: string
    password: string
    email: string
}

export interface VerifyCodePayload {
    username: string
    code: string
}

export interface ResendCodePayload {
    username: string
}

export interface AuthUser {
    id: string
    email: string
    name: string
}

export interface AuthResponse {
    token: string
    user: AuthUser
}

export interface RegisterResponse {
    message: string
    email_verification_required: boolean
    auth: LoginResponse | null
}

export interface VerifyResponse {
    message: string
    auth: LoginResponse
}

export interface ResendResponse {
    message: string
}

export interface ApiError {
    detail: { loc: (string | number)[]; msg: string; type: string }[] | string
}
