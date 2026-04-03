// ─── Core domain types ──────────────────────────────────────────────────────

export type AgentStatus = 'online' | 'offline'
export type TaskStatus = 'pending' | 'running' | 'success' | 'failed' | 'timeout'

export interface Agent {
    id: string
    name: string
    hostname: string
    ip_address: string
    status: AgentStatus
    last_heartbeat: string   // ISO 8601
    tasks_count: number
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

// ─── Request/response shapes ─────────────────────────────────────────────────

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
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface LoginPayload {
    email: string
    password: string
}

export interface RegisterPayload {
    email: string
    password: string
    name: string
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
