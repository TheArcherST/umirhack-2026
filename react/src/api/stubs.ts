/**
 * Mock API — returns realistic data with a simulated network delay.
 * Swap these out for real apiClient calls when the backend is ready.
 */

import {
    Agent,
    Task,
    TaskDetail,
    Stats,
    PaginatedResponse,
    ListAgentsParams,
    ListTasksParams,
    CreateTaskPayload,
    AuthResponse,
    LoginPayload,
    RegisterPayload,
    VerifyCodePayload,
    Project,
    Environment,
    ProjectMember,
    EnvMemberAssignment,
    CreateProjectPayload,
    CreateEnvironmentPayload,
    CreateAgentPayload,
    UpdateAgentPayload,
    InviteMemberPayload,
    AssignEnvRolePayload,
    InstallScript,
    UserSearchResult, MemberRole, TaskStatus,
    HostInfo,
    ServiceInfo,
    PortInfo,
    CreateTaskPayloadV2,
} from './types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const delay = (ms = 350) => new Promise((r) => setTimeout(r, ms))

function ago(seconds: number): string {
    return new Date(Date.now() - seconds * 1000).toISOString()
}

// ─── Pending registration ────────────────────────────────────────────────────

let _pendingRegistration: RegisterPayload | null = null

// ─── Mock data: Projects, Environments, Members ──────────────────────────────

const CURRENT_USER_ID = 'u-001'

const PROJECTS: Project[] = [
    {id: 'proj-001', name: 'My Infrastructure', owner_id: CURRENT_USER_ID, created_at: ago(86400 * 30)},
]

const ENVIRONMENTS: Environment[] = [
    {id: 'env-main', name: 'main', project_id: 'proj-001', created_at: ago(86400 * 30)},
    {id: 'env-staging', name: 'staging', project_id: 'proj-001', created_at: ago(86400 * 10)},
]

const MEMBERS: ProjectMember[] = [
    {
        user_id: CURRENT_USER_ID,
        email: 'admin@company.com',
        name: 'Admin',
        role: 'owner',
        status: 'accepted',
        invited_at: ago(86400 * 30)
    },
    {
        user_id: 'u-002',
        email: 'dev@company.com',
        name: 'Developer',
        role: 'operator',
        status: 'accepted',
        invited_at: ago(86400 * 10)
    },
    {
        user_id: 'u-003',
        email: 'alice@company.com',
        name: 'Alice',
        role: 'observer',
        status: 'pending',
        invited_at: ago(3600)
    },
]

const ENV_MEMBERS: EnvMemberAssignment[] = [
    {user_id: CURRENT_USER_ID, env_id: 'env-main', role: 'admin'},
    {user_id: CURRENT_USER_ID, env_id: 'env-staging', role: 'admin'},
    {user_id: 'u-002', env_id: 'env-main', role: 'operator'},
]

// ─── Mock data: Agents (with environment_id + os) ────────────────────────────

const AGENTS: Agent[] = [
    {
        id: 'ag-001', name: 'web-prod-01', hostname: 'web-prod-01.internal',
        ip_address: '10.0.1.10', os: 'linux', status: 'online',
        last_heartbeat: ago(12), tasks_count: 142, environment_ids: ['env-main'],
        created_at: ago(86400 * 30),
    },
    {
        id: 'ag-002', name: 'web-prod-02', hostname: 'web-prod-02.internal',
        ip_address: '10.0.1.11', os: 'linux', status: 'online',
        last_heartbeat: ago(8), tasks_count: 138, environment_ids: ['env-main'],
        created_at: ago(86400 * 30),
    },
    {
        id: 'ag-003', name: 'db-master-01', hostname: 'db-master-01.internal',
        ip_address: '10.0.2.10', os: 'linux', status: 'online',
        last_heartbeat: ago(5), tasks_count: 89, environment_ids: ['env-main'],
        created_at: ago(86400 * 45),
    },
    {
        id: 'ag-004', name: 'db-replica-01', hostname: 'db-replica-01.internal',
        ip_address: '10.0.2.11', os: 'linux', status: 'offline',
        last_heartbeat: ago(3600 * 2), tasks_count: 72, environment_ids: ['env-main'],
        created_at: ago(86400 * 45),
    },
    {
        id: 'ag-005', name: 'staging-web-01', hostname: 'staging-web-01.internal',
        ip_address: '10.1.1.10', os: 'linux', status: 'online',
        last_heartbeat: ago(20), tasks_count: 55, environment_ids: ['env-staging'],
        created_at: ago(86400 * 20),
    },
    {
        id: 'ag-006', name: 'staging-worker-01', hostname: 'staging-worker-01.internal',
        ip_address: '10.1.4.10', os: 'linux', status: 'online',
        last_heartbeat: ago(15), tasks_count: 201, environment_ids: ['env-staging', 'env-main'],
        created_at: ago(86400 * 60),
    },
]

// ─── Mock data: Tasks ────────────────────────────────────────────────────────

const COMMANDS = [
    'df -h', 'free -m', 'uptime', 'ps aux --sort=-%cpu | head -10',
    'netstat -tulpn | grep LISTEN', 'systemctl status nginx',
    'tail -n 50 /var/log/syslog', 'ip addr show',
]

const STDOUTS: Record<string, string> = {
    'df -h': `Filesystem      Size  Used Avail Use% Mounted on\n/dev/sda1        50G   18G   30G  38% /\ntmpfs           7.8G     0  7.8G   0% /dev/shm`,
    'free -m': `               total        used        free\nMem:           15937        4821        8432\nSwap:           2047           0        2047`,
    uptime: ` 14:23:17 up 42 days, 18:06,  1 user,  load average: 0.08, 0.12, 0.10`,
    'ip addr show': `1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536\n    inet 127.0.0.1/8 scope host lo\n2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500\n    inet 10.0.1.10/24 brd 10.0.1.255 scope global eth0`,
}

function makeTask(i: number, agentId: string, agentName: string, offsetSeconds: number): Task {
    const statuses: TaskStatus[] = ['success', 'success', 'success', 'failed', 'timeout'] as const
    const status = statuses[i % statuses.length]
    const command = COMMANDS[i % COMMANDS.length]
    const duration = status === 'success' ? 0.4 + Math.random() * 8 : status === 'failed' ? 0.1 + Math.random() * 2 : 30
    return {
        id: `task-${agentId}-${String(i).padStart(4, '0')}`,
        agent_id: agentId, agent_name: agentName, command, status,
        timeout: 30, duration: status !== 'pending' ? Math.round(duration * 10) / 10 : null,
        started_at: ago(offsetSeconds - 1),
        completed_at: status !== 'pending' ? ago(offsetSeconds - 1 - duration) : null,
        created_at: ago(offsetSeconds),
    }
}

let _tasks: Task[] = []
AGENTS.forEach((agent) => {
    for (let i = 0; i < 30; i++) {
        _tasks.push(makeTask(i, agent.id, agent.name, i * 600 + Math.floor(Math.random() * 120)))
    }
})
_tasks.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

// Auth

export async function stubLogin(payload: LoginPayload): Promise<AuthResponse> {
    await delay(600)
    if (payload.password.length < 4) throw new Error('Invalid credentials')
    return {
        token: 'stub-token-abc123',
        user: {id: 'u-001', email: payload.username, name: payload.username},
    }
}

export async function stubRegister(payload: RegisterPayload): Promise<{ email: string }> {
    await delay(600)
    if (payload.password.length < 6) throw new Error('Password must be at least 6 characters')
    if (!payload.email.includes('@')) throw new Error('Invalid email address')
    _pendingRegistration = payload
    return {email: payload.email}
}

export async function stubVerifyCode(payload: VerifyCodePayload): Promise<AuthResponse> {
    await delay(600)
    if (!_pendingRegistration) throw new Error('Registration session expired')
    if (payload.email !== _pendingRegistration.email) throw new Error('Invalid email')
    if (payload.code !== '123456') throw new Error('Invalid verification code')
    const user = {id: 'u-' + Date.now(), email: _pendingRegistration.email, name: _pendingRegistration.name}
    _pendingRegistration = null
    return {token: 'stub-token-' + Date.now(), user}
}

// Projects & Environments

export async function stubGetProjects(): Promise<Project[]> {
    await delay(200)
    return [...PROJECTS]
}

export async function stubGetProject(projectId: string): Promise<Project | null> {
    await delay(200)
    return PROJECTS.find((p) => p.id === projectId) ?? null
}

export async function stubCreateProject(payload: CreateProjectPayload): Promise<Project> {
    await delay(400)
    const newProject: Project = {
        id: 'proj-' + Date.now(), name: payload.name,
        owner_id: CURRENT_USER_ID, created_at: new Date().toISOString(),
    }
    PROJECTS.push(newProject)
    const envId = 'env-main-' + Date.now()
    ENVIRONMENTS.push({
        id: envId, name: 'main',
        project_id: newProject.id, created_at: new Date().toISOString(),
    })
    // Owner is auto admin of main env
    ENV_MEMBERS.push({user_id: CURRENT_USER_ID, env_id: envId, role: 'admin'})
    return newProject
}

export async function stubGetEnvironments(projectId: string): Promise<Environment[]> {
    await delay(200)
    return ENVIRONMENTS.filter((e) => e.project_id === projectId)
}

export async function stubCreateEnvironment(payload: CreateEnvironmentPayload): Promise<Environment> {
    await delay(400)
    const newEnv: Environment = {
        id: 'env-' + Date.now(), name: payload.name,
        project_id: payload.project_id, created_at: new Date().toISOString(),
    }
    ENVIRONMENTS.push(newEnv)
    // Creator is auto admin of new env
    ENV_MEMBERS.push({user_id: CURRENT_USER_ID, env_id: newEnv.id, role: 'admin'})
    return newEnv
}

export async function stubDeleteEnvironment(envId: string): Promise<void> {
    await delay(300)
    const idx = ENVIRONMENTS.findIndex((e) => e.id === envId)
    if (idx !== -1) ENVIRONMENTS.splice(idx, 1)
    for (let i = AGENTS.length - 1; i >= 0; i--) {
        if (AGENTS[i].environment_id === envId) AGENTS.splice(i, 1)
    }
}

// Members

export async function stubGetProjectMembers(projectId: string): Promise<ProjectMember[]> {
    await delay(200)
    return [...MEMBERS]
}

export async function stubInviteMember(payload: InviteMemberPayload): Promise<ProjectMember> {
    await delay(400)
    // Check if user already exists
    const existing = MEMBERS.find((m) => m.email === payload.email)
    if (existing) throw new Error('User already invited')

    const newMember: ProjectMember = {
        user_id: 'u-' + Date.now(), email: payload.email,
        name: payload.email.split('@')[0], role: 'observer',
        status: 'pending', invited_at: new Date().toISOString(),
    }
    MEMBERS.push(newMember)
    return newMember
}

export async function stubRemoveMember(userId: string): Promise<void> {
    await delay(300)
    const idx = MEMBERS.findIndex((m) => m.user_id === userId)
    if (idx !== -1) MEMBERS.splice(idx, 1)
    // Also remove from all envs
    for (let i = ENV_MEMBERS.length - 1; i >= 0; i--) {
        if (ENV_MEMBERS[i].user_id === userId) ENV_MEMBERS.splice(i, 1)
    }
}

export async function stubUpdateProjectRole(userId: string, role: MemberRole): Promise<ProjectMember> {
    await delay(300)
    const member = MEMBERS.find((m) => m.user_id === userId)
    if (!member) throw new Error('Member not found')
    member.role = role
    return {...member}
}

export async function stubAssignEnvRole(payload: AssignEnvRolePayload): Promise<EnvMemberAssignment> {
    await delay(300)
    // If removing (role is empty or 'none'), delete assignment
    if (!payload.role || payload.role === 'none') {
        const idx = ENV_MEMBERS.findIndex((m) => m.user_id === payload.user_id && m.env_id === payload.env_id)
        if (idx !== -1) ENV_MEMBERS.splice(idx, 1)
        return {user_id: payload.user_id, env_id: payload.env_id, role: 'observer'}
    }
    const existing = ENV_MEMBERS.find((m) => m.user_id === payload.user_id && m.env_id === payload.env_id)
    if (existing) {
        existing.role = payload.role;
        return existing
    }
    const newAssignment: EnvMemberAssignment = {
        user_id: payload.user_id, env_id: payload.env_id, role: payload.role,
    }
    ENV_MEMBERS.push(newAssignment)
    return newAssignment
}

export async function stubGetEnvMembers(envId: string): Promise<EnvMemberAssignment[]> {
    await delay(200)
    return ENV_MEMBERS.filter((m) => m.env_id === envId)
}

// ─── Agents ──────────────────────────────────────────────────────────────────

export async function stubGetAgents(params?: ListAgentsParams): Promise<Agent[]> {
    await delay(300)
    let result = [...AGENTS]
    if (params?.status) result = result.filter((a) => a.status === params.status)
    if (params?.environment_id) result = result.filter((a) => a.environment_ids.includes(params.environment_id!))
    return result
}

export async function stubCreateAgent(payload: CreateAgentPayload): Promise<{
    agent: Agent;
    installScript: InstallScript
}> {
    await delay(500)
    const newAgent: Agent = {
        id: 'ag-' + Date.now(), name: payload.name,
        hostname: payload.name.toLowerCase().replace(/\s+/g, '-') + '.internal',
        ip_address: '0.0.0.0', os: payload.os, status: 'offline',
        last_heartbeat: null as any, tasks_count: 0,
        environment_ids: payload.environment_ids, created_at: new Date().toISOString(),
    }
    AGENTS.push(newAgent)
    const installScript: InstallScript = {
        command: `curl -sSL https://diag-platform.internal/install.sh | bash -s -- --token diag-token-${Date.now()} --agent-id ${newAgent.id} --platform ${payload.os}`,
        agent_id: newAgent.id,
    }
    return {agent: newAgent, installScript}
}

export async function stubUpdateAgent(id: string, payload: UpdateAgentPayload): Promise<Agent> {
    await delay(300)
    const agent = AGENTS.find((a) => a.id === id)
    if (!agent) throw new Error('Agent not found')
    if (payload.name) agent.name = payload.name
    if (payload.environment_ids) agent.environment_ids = payload.environment_ids
    return {...agent}
}

export async function stubDeleteAgent(id: string): Promise<void> {
    await delay(300)
    const idx = AGENTS.findIndex((a) => a.id === id)
    if (idx !== -1) AGENTS.splice(idx, 1)
}

export async function stubGetAgentInstallScript(id: string): Promise<InstallScript> {
    await delay(200)
    const agent = AGENTS.find((a) => a.id === id)
    if (!agent) throw new Error('Agent not found')
    return {
        command: `curl -sSL https://diag-platform.internal/install.sh | bash -s -- --token diag-token-${id} --agent-id ${id} --platform ${agent.os}`,
        agent_id: id,
    }
}

// ─── Stats ───────────────────────────────────────────────────────────────────

export async function stubGetStats(): Promise<Stats> {
    await delay(300)
    return {
        total_agents: AGENTS.length,
        online_agents: AGENTS.filter((a) => a.status === 'online').length,
        tasks_today: 12,
        successful_tasks: _tasks.filter((t) => t.status === 'success').length,
        failed_tasks: _tasks.filter((t) => t.status === 'failed').length,
    }
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export async function stubGetTasks(params?: ListTasksParams): Promise<PaginatedResponse<Task>> {
    await delay(350)
    let filtered = [..._tasks]
    if (params?.agent_id) filtered = filtered.filter((t) => t.agent_id === params.agent_id)
    if (params?.status) filtered = filtered.filter((t) => t.status === params.status)
    const page = params?.page ?? 1
    const perPage = params?.per_page ?? 20
    return {
        items: filtered.slice((page - 1) * perPage, page * perPage),
        total: filtered.length, page, per_page: perPage,
        total_pages: Math.ceil(filtered.length / perPage),
    }
}

export async function stubGetTask(taskId: string): Promise<TaskDetail> {
    await delay(250)
    const task = _tasks.find((t) => t.id === taskId)
    if (!task) throw new Error(`Task ${taskId} not found`)
    const stdout = STDOUTS[task.command] ?? `Command executed successfully.\nExit: 0`
    const stderr = task.status === 'failed' ? `Error: connection refused\nerrno 111` : ''
    const result = task.status !== 'pending' && task.status !== 'running'
        ? {
            id: `result-${task.id}`,
            task_id: task.id,
            exit_code: task.status === 'success' ? 0 : 1,
            stdout,
            stderr,
            duration: task.duration ?? 0
        }
        : null
    return {...task, result}
}

export async function stubCreateTask(payload: CreateTaskPayload): Promise<Task> {
    await delay(400)
    const agent = AGENTS.find((a) => a.id === payload.agent_id)
    if (!agent) throw new Error('Agent not found')
    const newTask: Task = {
        id: `task-${payload.agent_id}-${Date.now()}`, agent_id: payload.agent_id,
        agent_name: agent.name, command: payload.command, status: 'pending',
        timeout: payload.timeout ?? 30, duration: null,
        started_at: null, completed_at: null, created_at: new Date().toISOString(),
    }
    _tasks = [newTask, ..._tasks]
    setTimeout(() => {
        const idx = _tasks.findIndex((t) => t.id === newTask.id)
        if (idx !== -1) _tasks[idx] = {..._tasks[idx], status: 'running', started_at: new Date().toISOString()}
    }, 800)
    setTimeout(() => {
        const idx = _tasks.findIndex((t) => t.id === newTask.id)
        if (idx !== -1) {
            const dur = 1.2 + Math.random() * 4
            _tasks[idx] = {
                ..._tasks[idx],
                status: 'success',
                duration: Math.round(dur * 10) / 10,
                completed_at: new Date().toISOString()
            }
        }
    }, 2500)
    return newTask
}

export async function stubGetRecentTasks(limit = 8): Promise<Task[]> {
    await delay(300)
    return _tasks.slice(0, limit)
}

// ─── User Search ─────────────────────────────────────────────────────────────

// Pre-existing mock users for search
const KNOWN_USERS = [
    {user_id: 'u-002', email: 'dev@company.com', name: 'Developer'},
    {user_id: 'u-003', email: 'alice@company.com', name: 'Alice'},
    {user_id: 'u-004', email: 'bob@company.com', name: 'Bob Smith'},
    {user_id: 'u-005', email: 'charlie@company.com', name: 'Charlie'},
    {user_id: 'u-006', email: 'diana.ops@company.com', name: 'Diana Ops'},
]

export async function stubSearchUsers(query: string): Promise<UserSearchResult[]> {
    await delay(300)
    if (!query || query.length < 2) return []
    const q = query.toLowerCase()
    return KNOWN_USERS.filter(
        (u) => u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q),
    )
}

// ─── Host Info, Services, Ports ──────────────────────────────────────────────

const HOST_INFO_MAP: Record<string, HostInfo> = {
    'ag-001': {
        hostname: 'web-prod-01.internal',
        os_name: 'Ubuntu',
        os_version: '22.04.3 LTS (Jammy Jellyfish)',
        kernel: '5.15.0-91-generic',
        interfaces: [
            { name: 'lo', mac: '00:00:00:00:00:00', ipv4: ['127.0.0.1'], ipv6: ['::1'] },
            { name: 'eth0', mac: '02:42:ac:11:00:0a', ipv4: ['10.0.1.10'], ipv6: ['fe80::42:acff:fe11:a'] },
        ],
        ip_addresses: ['10.0.1.10', '127.0.0.1'],
        uptime: '42 days, 18:06:12',
        cpu_model: 'Intel(R) Xeon(R) Gold 6248R @ 3.00GHz',
        cpu_cores: 8,
        memory_total_mb: 16384,
    },
    'ag-002': {
        hostname: 'web-prod-02.internal',
        os_name: 'Ubuntu',
        os_version: '22.04.3 LTS (Jammy Jellyfish)',
        kernel: '5.15.0-91-generic',
        interfaces: [
            { name: 'lo', mac: '00:00:00:00:00:00', ipv4: ['127.0.0.1'], ipv6: ['::1'] },
            { name: 'eth0', mac: '02:42:ac:11:00:0b', ipv4: ['10.0.1.11'], ipv6: ['fe80::42:acff:fe11:b'] },
        ],
        ip_addresses: ['10.0.1.11', '127.0.0.1'],
        uptime: '42 days, 18:05:44',
        cpu_model: 'Intel(R) Xeon(R) Gold 6248R @ 3.00GHz',
        cpu_cores: 8,
        memory_total_mb: 16384,
    },
    'ag-003': {
        hostname: 'db-master-01.internal',
        os_name: 'Debian GNU/Linux',
        os_version: '12 (bookworm)',
        kernel: '6.1.0-17-amd64',
        interfaces: [
            { name: 'lo', mac: '00:00:00:00:00:00', ipv4: ['127.0.0.1'], ipv6: ['::1'] },
            { name: 'eth0', mac: '02:42:ac:11:00:1a', ipv4: ['10.0.2.10'], ipv6: ['fe80::42:acff:fe11:1a'] },
        ],
        ip_addresses: ['10.0.2.10', '127.0.0.1'],
        uptime: '90 days, 04:22:37',
        cpu_model: 'AMD EPYC 7763 64-Core Processor',
        cpu_cores: 16,
        memory_total_mb: 65536,
    },
    'ag-004': {
        hostname: 'db-replica-01.internal',
        os_name: 'Debian GNU/Linux',
        os_version: '12 (bookworm)',
        kernel: '6.1.0-17-amd64',
        interfaces: [
            { name: 'lo', mac: '00:00:00:00:00:00', ipv4: ['127.0.0.1'], ipv6: ['::1'] },
            { name: 'eth0', mac: '02:42:ac:11:00:1b', ipv4: ['10.0.2.11'], ipv6: ['fe80::42:acff:fe11:1b'] },
        ],
        ip_addresses: ['10.0.2.11', '127.0.0.1'],
        uptime: '90 days, 04:20:11',
        cpu_model: 'AMD EPYC 7763 64-Core Processor',
        cpu_cores: 16,
        memory_total_mb: 65536,
    },
    'ag-005': {
        hostname: 'staging-web-01.internal',
        os_name: 'AlmaLinux',
        os_version: '9.3 (Shamrock Pampas Cat)',
        kernel: '5.14.0-362.18.1.el9_3.x86_64',
        interfaces: [
            { name: 'lo', mac: '00:00:00:00:00:00', ipv4: ['127.0.0.1'], ipv6: ['::1'] },
            { name: 'eth0', mac: '02:42:ac:11:01:0a', ipv4: ['10.1.1.10'], ipv6: ['fe80::42:acff:fe11:10a'] },
        ],
        ip_addresses: ['10.1.1.10', '127.0.0.1'],
        uptime: '20 days, 11:42:05',
        cpu_model: 'Intel(R) Xeon(R) Platinum 8375C @ 2.90GHz',
        cpu_cores: 4,
        memory_total_mb: 8192,
    },
    'ag-006': {
        hostname: 'staging-worker-01.internal',
        os_name: 'AlmaLinux',
        os_version: '9.3 (Shamrock Pampas Cat)',
        kernel: '5.14.0-362.18.1.el9_3.x86_64',
        interfaces: [
            { name: 'lo', mac: '00:00:00:00:00:00', ipv4: ['127.0.0.1'], ipv6: ['::1'] },
            { name: 'eth0', mac: '02:42:ac:11:04:0a', ipv4: ['10.1.4.10'], ipv6: ['fe80::42:acff:fe11:40a'] },
        ],
        ip_addresses: ['10.1.4.10', '127.0.0.1'],
        uptime: '60 days, 08:15:33',
        cpu_model: 'Intel(R) Xeon(R) Platinum 8375C @ 2.90GHz',
        cpu_cores: 4,
        memory_total_mb: 8192,
    },
}

const HOST_SERVICES_MAP: Record<string, { services: ServiceInfo[]; ports: PortInfo[] }> = {
    'ag-001': {
        services: [
            { name: 'nginx', status: 'running', port: 80, known: true },
            { name: 'sshd', status: 'running', port: 22, known: false },
            { name: 'node-app', status: 'running', port: 3000, known: false },
            { name: 'redis', status: 'running', port: 6379, known: false },
        ],
        ports: [
            { port: 22, protocol: 'tcp', service: 'sshd', state: 'listening' },
            { port: 80, protocol: 'tcp', service: 'nginx', state: 'listening' },
            { port: 443, protocol: 'tcp', service: 'nginx', state: 'listening' },
            { port: 3000, protocol: 'tcp', service: 'node', state: 'listening' },
            { port: 6379, protocol: 'tcp', service: 'redis', state: 'listening' },
        ],
    },
    'ag-002': {
        services: [
            { name: 'nginx', status: 'running', port: 80, known: true },
            { name: 'sshd', status: 'running', port: 22, known: false },
            { name: 'node-app', status: 'running', port: 3000, known: false },
        ],
        ports: [
            { port: 22, protocol: 'tcp', service: 'sshd', state: 'listening' },
            { port: 80, protocol: 'tcp', service: 'nginx', state: 'listening' },
            { port: 443, protocol: 'tcp', service: 'nginx', state: 'listening' },
            { port: 3000, protocol: 'tcp', service: 'node', state: 'listening' },
        ],
    },
    'ag-003': {
        services: [
            { name: 'postgres', status: 'running', port: 5432, known: true },
            { name: 'sshd', status: 'running', port: 22, known: false },
            { name: 'prometheus', status: 'running', port: 9090, known: false },
            { name: 'pgbouncer', status: 'running', port: 6432, known: false },
        ],
        ports: [
            { port: 22, protocol: 'tcp', service: 'sshd', state: 'listening' },
            { port: 5432, protocol: 'tcp', service: 'postgres', state: 'listening' },
            { port: 6432, protocol: 'tcp', service: 'pgbouncer', state: 'listening' },
            { port: 9090, protocol: 'tcp', service: 'prometheus', state: 'listening' },
        ],
    },
    'ag-004': {
        services: [
            { name: 'postgres', status: 'running', port: 5432, known: true },
            { name: 'sshd', status: 'running', port: 22, known: false },
            { name: 'mongo', status: 'stopped', known: true },
        ],
        ports: [
            { port: 22, protocol: 'tcp', service: 'sshd', state: 'listening' },
            { port: 5432, protocol: 'tcp', service: 'postgres', state: 'listening' },
        ],
    },
    'ag-005': {
        services: [
            { name: 'nginx', status: 'running', port: 80, known: true },
            { name: 'sshd', status: 'running', port: 22, known: false },
            { name: 'node-app', status: 'running', port: 3000, known: false },
            { name: 'mongo', status: 'stopped', known: true },
        ],
        ports: [
            { port: 22, protocol: 'tcp', service: 'sshd', state: 'listening' },
            { port: 80, protocol: 'tcp', service: 'nginx', state: 'listening' },
            { port: 3000, protocol: 'tcp', service: 'node', state: 'listening' },
        ],
    },
    'ag-006': {
        services: [
            { name: 'sshd', status: 'running', port: 22, known: false },
            { name: 'redis', status: 'running', port: 6379, known: false },
            { name: 'celery-worker', status: 'running', known: false },
        ],
        ports: [
            { port: 22, protocol: 'tcp', service: 'sshd', state: 'listening' },
            { port: 6379, protocol: 'tcp', service: 'redis', state: 'listening' },
        ],
    },
}

export async function stubGetHostInfo(hostId: string): Promise<HostInfo | null> {
    await delay(200)
    return HOST_INFO_MAP[hostId] ?? null
}

export async function stubGetHostServices(hostId: string): Promise<{ services: ServiceInfo[]; ports: PortInfo[] }> {
    await delay(200)
    return HOST_SERVICES_MAP[hostId] ?? { services: [], ports: [] }
}

export async function stubGetHostPorts(hostId: string): Promise<PortInfo[]> {
    await delay(200)
    return HOST_SERVICES_MAP[hostId]?.ports ?? []
}

// ─── Task Creation V2 (template-based) ───────────────────────────────────────

const TEMPLATE_COMMANDS: Record<string, string> = {
    ping: 'ping -c 4 {target}',
    system_info: 'uname -a && cat /etc/os-release 2>/dev/null',
    network_interfaces: 'ip addr show',
    port_scan: 'ss -tulpn | grep LISTEN',
    disk_usage: 'df -h',
    memory_cpu: 'free -m && uptime',
    service_status: 'systemctl status nginx postgresql mongod --no-pager 2>/dev/null || echo "services not found"',
    system_logs: 'journalctl -n 50 --no-pager',
}

export async function stubCreateTaskV2(payload: CreateTaskPayloadV2): Promise<Task> {
    await delay(400)
    const agent = AGENTS.find((a) => a.id === payload.agent_id)
    if (!agent) throw new Error('Agent not found')

    let command = TEMPLATE_COMMANDS[payload.template] ?? payload.template
    if (payload.template === 'ping' && payload.target) {
        command = command.replace('{target}', payload.target)
    }

    const newTask: Task = {
        id: `task-${payload.agent_id}-${Date.now()}`,
        agent_id: payload.agent_id,
        agent_name: agent.name,
        command,
        status: 'pending',
        timeout: 30,
        duration: null,
        started_at: null,
        completed_at: null,
        created_at: new Date().toISOString(),
    }
    _tasks = [newTask, ..._tasks]

    // Simulate task execution
    setTimeout(() => {
        const idx = _tasks.findIndex((t) => t.id === newTask.id)
        if (idx !== -1) _tasks[idx] = { ..._tasks[idx], status: 'running', started_at: new Date().toISOString() }
    }, 800)
    setTimeout(() => {
        const idx = _tasks.findIndex((t) => t.id === newTask.id)
        if (idx !== -1) {
            const dur = 1.2 + Math.random() * 4
            _tasks[idx] = {
                ..._tasks[idx],
                status: 'success',
                duration: Math.round(dur * 10) / 10,
                completed_at: new Date().toISOString(),
            }
        }
    }, 2500)

    return newTask
}
