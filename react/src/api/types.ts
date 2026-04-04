// ─── Core domain types ──────────────────────────────────────────────────────

export type AgentStatus = 'online' | 'offline'
export type TaskStatus = 'pending' | 'running' | 'success' | 'failed' | 'timeout'
export type MemberRole = 'owner' | 'admin' | 'operator' | 'observer'
export type EnvRole = 'operator' | 'observer'
export type AgentOS = 'linux' | 'windows' | 'macos'

// ─── Task Templates ─────────────────────────────────────────────────────────

export type TaskTemplate = 'ping' | 'system_info' | 'network_interfaces' | 'port_scan' | 'disk_usage' | 'memory_cpu' | 'service_status' | 'system_logs'

export interface TaskTemplateOption {
    id: TaskTemplate
    label: string
    description: string
    requiresTarget?: boolean  // true if user needs to select a target (e.g. ping)
}

export const TASK_TEMPLATES: TaskTemplateOption[] = [
    { id: 'ping', label: 'Ping', description: 'Ping a host or domain', requiresTarget: true },
    { id: 'system_info', label: 'System Info', description: 'OS version, hostname, interfaces' },
    { id: 'network_interfaces', label: 'Network Interfaces', description: 'IP addresses, routes, interfaces' },
    { id: 'port_scan', label: 'Port Scan', description: 'List listening ports and services' },
    { id: 'disk_usage', label: 'Disk Usage', description: 'Disk space and partitions' },
    { id: 'memory_cpu', label: 'Memory & CPU', description: 'RAM, CPU load, uptime' },
    { id: 'service_status', label: 'Service Status', description: 'Running services (nginx, postgres, etc.)' },
    { id: 'system_logs', label: 'System Logs', description: 'Recent system logs (journalctl)' },
]

export interface CreateTaskPayloadV2 {
    agent_id: string
    template: TaskTemplate
    target?: string  // For ping: domain/IP or host
}

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

export type InviteStatus = 'pending' | 'accepted'

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
    role: EnvRole | 'admin'  // 'admin' for auto-assigned creator
}

export interface Agent {
    id: string
    name: string
    hostname: string
    ip_address: string
    os: AgentOS
    status: AgentStatus
    last_heartbeat: string   // ISO 8601
    tasks_count: number
    environment_ids: string[]
    created_at: string
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
    known: boolean  // true for known services like nginx, postgres, mongo
}

export interface PortInfo {
    port: number
    protocol: 'tcp' | 'udp'
    service?: string
    state: 'listening' | 'established'
}

export interface Task {
    id: string
    agent_id: string
    agent_name: string
    command: string
    status: TaskStatus
    timeout: number          // seconds
    duration: number | null  // seconds
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

// Request/response shapes

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

// Project / Environment

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
    environment_ids: string[]
}

export interface UpdateAgentPayload {
    name?: string
    environment_ids?: string[]
}

export interface InviteMemberPayload {
    project_id: string
    email: string
}

export interface AssignEnvRolePayload {
    user_id: string
    env_id: string
    role: EnvRole;
}

export interface InstallScript {
    command: string
    agent_id: string
}

export interface UserSearchResult {
    user_id: string
    email: string
    name: string
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface LoginPayload {
    username: string
    password: string
}

export interface LoginResponse {
    login_session_uid: string
    login_session_token: string
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
}

export interface VerifyResponse {
    message: string
}

export interface ResendResponse {
    message: string
}

export interface ApiError {
    detail: { loc: (string | number)[]; msg: string; type: string }[]
}
