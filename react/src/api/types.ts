// ─── Core domain types ──────────────────────────────────────────────────────

export type AgentStatus = 'online' | 'offline'
export type TaskStatus = 'pending' | 'running' | 'success' | 'failed' | 'timeout'
export type MemberRole = 'none' | 'owner' | 'admin' | 'operator' | 'observer'
export type EnvRole = 'none' | 'admin' | 'operator' | 'observer'
export type AgentOS = 'linux' | 'windows' | 'macos'

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
    role: EnvRole
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
