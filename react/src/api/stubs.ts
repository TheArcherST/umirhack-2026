/**
 * Mock API — returns realistic data with a simulated network delay.
 * Swap these out for real apiClient calls when the backend is ready.
 */

import type {
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
} from './types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const delay = (ms = 350) => new Promise((r) => setTimeout(r, ms))

function ago(seconds: number): string {
    return new Date(Date.now() - seconds * 1000).toISOString()
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const AGENTS: Agent[] = [
    {
        id: 'ag-001',
        name: 'web-prod-01',
        hostname: 'web-prod-01.internal',
        ip_address: '10.0.1.10',
        status: 'online',
        last_heartbeat: ago(12),
        tasks_count: 142,
        created_at: ago(86400 * 30),
    },
    {
        id: 'ag-002',
        name: 'web-prod-02',
        hostname: 'web-prod-02.internal',
        ip_address: '10.0.1.11',
        status: 'online',
        last_heartbeat: ago(8),
        tasks_count: 138,
        created_at: ago(86400 * 30),
    },
    {
        id: 'ag-003',
        name: 'db-master-01',
        hostname: 'db-master-01.internal',
        ip_address: '10.0.2.10',
        status: 'online',
        last_heartbeat: ago(5),
        tasks_count: 89,
        created_at: ago(86400 * 45),
    },
    {
        id: 'ag-004',
        name: 'db-replica-01',
        hostname: 'db-replica-01.internal',
        ip_address: '10.0.2.11',
        status: 'offline',
        last_heartbeat: ago(3600 * 2),
        tasks_count: 72,
        created_at: ago(86400 * 45),
    },
    {
        id: 'ag-005',
        name: 'cache-01',
        hostname: 'cache-01.internal',
        ip_address: '10.0.3.10',
        status: 'online',
        last_heartbeat: ago(20),
        tasks_count: 55,
        created_at: ago(86400 * 20),
    },
    {
        id: 'ag-006',
        name: 'worker-01',
        hostname: 'worker-01.internal',
        ip_address: '10.0.4.10',
        status: 'online',
        last_heartbeat: ago(15),
        tasks_count: 201,
        created_at: ago(86400 * 60),
    },
    {
        id: 'ag-007',
        name: 'worker-02',
        hostname: 'worker-02.internal',
        ip_address: '10.0.4.11',
        status: 'offline',
        last_heartbeat: ago(3600 * 5),
        tasks_count: 187,
        created_at: ago(86400 * 60),
    },
    {
        id: 'ag-008',
        name: 'monitoring-01',
        hostname: 'monitoring-01.internal',
        ip_address: '10.0.5.10',
        status: 'online',
        last_heartbeat: ago(3),
        tasks_count: 314,
        created_at: ago(86400 * 90),
    },
    {
        id: 'ag-009',
        name: 'api-gateway-01',
        hostname: 'api-gw-01.internal',
        ip_address: '10.0.1.1',
        status: 'online',
        last_heartbeat: ago(9),
        tasks_count: 97,
        created_at: ago(86400 * 15),
    },
]

const COMMANDS = [
    'df -h',
    'free -m',
    'uptime',
    'ps aux --sort=-%cpu | head -10',
    'netstat -tulpn | grep LISTEN',
    'systemctl status nginx',
    'systemctl status postgresql',
    'tail -n 50 /var/log/syslog',
    'cat /proc/cpuinfo | grep "model name" | head -1',
    'ss -s',
    'iostat -x 1 3',
    'vmstat -s',
    'lsblk',
    'ip addr show',
    'cat /etc/os-release',
]

const STDOUTS: Record<string, string> = {
    'df -h': `Filesystem      Size  Used Avail Use% Mounted on
/dev/sda1        50G   18G   30G  38% /
tmpfs           7.8G     0  7.8G   0% /dev/shm
/dev/sda2       100G   45G   50G  48% /data`,
    'free -m': `               total        used        free      shared  buff/cache   available
Mem:           15937        4821        8432         312        2684       10502
Swap:           2047           0        2047`,
    uptime: ` 14:23:17 up 42 days, 18:06,  1 user,  load average: 0.08, 0.12, 0.10`,
    'ip addr show': `1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536
    inet 127.0.0.1/8 scope host lo
2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500
    inet 10.0.1.10/24 brd 10.0.1.255 scope global eth0`,
}

function makeTask(
    i: number,
    agentId: string,
    agentName: string,
    offsetSeconds: number,
): Task {
    const statuses = ['success', 'success', 'success', 'failed', 'timeout'] as const
    const status = statuses[i % statuses.length]
    const command = COMMANDS[i % COMMANDS.length]
    const duration = status === 'success' ? 0.4 + Math.random() * 8 : status === 'failed' ? 0.1 + Math.random() * 2 : 30
    const createdAt = ago(offsetSeconds)
    const startedAt = ago(offsetSeconds - 1)
    const completedAt = (status as string) !== 'pending' ? ago(offsetSeconds - 1 - duration) : null

    return {
        id: `task-${agentId}-${String(i).padStart(4, '0')}`,
        agent_id: agentId,
        agent_name: agentName,
        command,
        status,
        timeout: 30,
        duration: (status as string) !== 'pending' ? Math.round(duration * 10) / 10 : null,
        started_at: startedAt,
        completed_at: completedAt,
        created_at: createdAt,
    }
}

// Pre-generate tasks for all agents
let _tasks: Task[] = []
AGENTS.forEach((agent) => {
    for (let i = 0; i < 30; i++) {
        _tasks.push(makeTask(i, agent.id, agent.name, i * 600 + Math.floor(Math.random() * 120)))
    }
})
// Sort newest first
_tasks.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

// ─── API stub functions ───────────────────────────────────────────────────────

export async function stubLogin(payload: LoginPayload): Promise<AuthResponse> {
    await delay(600)
    if (payload.password.length < 4) throw new Error('Invalid credentials')
    return {
        token: 'stub-token-abc123',
        user: {id: 'u-001', email: payload.email, name: payload.email.split('@')[0]},
    }
}

export async function stubRegister(payload: RegisterPayload): Promise<AuthResponse> {
    await delay(600)
    if (payload.password.length < 6) throw new Error('Password must be at least 6 characters')
    if (!payload.email.includes('@')) throw new Error('Invalid email address')
    return {
        token: 'stub-token-' + Date.now(),
        user: {id: 'u-' + Date.now(), email: payload.email, name: payload.name},
    }
}

export async function stubGetStats(): Promise<Stats> {
    await delay(300)
    const today = new Date().toDateString()
    const todayTasks = _tasks.filter((t) => new Date(t.created_at).toDateString() === today)
    return {
        total_agents: AGENTS.length,
        online_agents: AGENTS.filter((a) => a.status === 'online').length,
        tasks_today: todayTasks.length || 12,
        successful_tasks: _tasks.filter((t) => t.status === 'success').length,
        failed_tasks: _tasks.filter((t) => t.status === 'failed').length,
    }
}

export async function stubGetAgents(params?: ListAgentsParams): Promise<Agent[]> {
    await delay(300)
    let result = [...AGENTS]
    if (params?.status) result = result.filter((a) => a.status === params.status)
    return result
}

export async function stubGetTasks(
    params?: ListTasksParams,
): Promise<PaginatedResponse<Task>> {
    await delay(350)
    let filtered = [..._tasks]
    if (params?.agent_id) filtered = filtered.filter((t) => t.agent_id === params.agent_id)
    if (params?.status) filtered = filtered.filter((t) => t.status === params.status)

    const page = params?.page ?? 1
    const perPage = params?.per_page ?? 20
    const start = (page - 1) * perPage
    const items = filtered.slice(start, start + perPage)

    return {
        items,
        total: filtered.length,
        page,
        per_page: perPage,
        total_pages: Math.ceil(filtered.length / perPage),
    }
}

export async function stubGetTask(taskId: string): Promise<TaskDetail> {
    await delay(250)
    const task = _tasks.find((t) => t.id === taskId)
    if (!task) throw new Error(`Task ${taskId} not found`)

    const stdout = STDOUTS[task.command] ?? `Command executed successfully.\nPID: ${Math.floor(Math.random() * 99999)}\nExit: 0`
    const stderr = task.status === 'failed' ? `Error: connection refused\nfailed to execute: ${task.command}\nerrno 111` : ''

    const result =
        task.status !== 'pending' && task.status !== 'running'
            ? {
                id: `result-${task.id}`,
                task_id: task.id,
                exit_code: task.status === 'success' ? 0 : task.status === 'timeout' ? 124 : 1,
                stdout,
                stderr,
                duration: task.duration ?? 0,
            }
            : null

    return {...task, result}
}

export async function stubCreateTask(payload: CreateTaskPayload): Promise<Task> {
    await delay(400)
    const agent = AGENTS.find((a) => a.id === payload.agent_id)
    if (!agent) throw new Error('Agent not found')

    const newTask: Task = {
        id: `task-${payload.agent_id}-${Date.now()}`,
        agent_id: payload.agent_id,
        agent_name: agent.name,
        command: payload.command,
        status: 'pending',
        timeout: payload.timeout ?? 30,
        duration: null,
        started_at: null,
        completed_at: null,
        created_at: new Date().toISOString(),
    }

    _tasks = [newTask, ..._tasks]

    // Simulate task running → success after a short delay
    setTimeout(() => {
        const idx = _tasks.findIndex((t) => t.id === newTask.id)
        if (idx !== -1) {
            _tasks[idx] = {
                ..._tasks[idx],
                status: 'running',
                started_at: new Date().toISOString(),
            }
        }
    }, 800)

    setTimeout(() => {
        const idx = _tasks.findIndex((t) => t.id === newTask.id)
        if (idx !== -1) {
            const duration = 1.2 + Math.random() * 4
            _tasks[idx] = {
                ..._tasks[idx],
                status: 'success',
                duration: Math.round(duration * 10) / 10,
                completed_at: new Date().toISOString(),
            }
        }
    }, 2500)

    return newTask
}

export async function stubGetRecentTasks(limit = 8): Promise<Task[]> {
    await delay(300)
    return _tasks.slice(0, limit)
}
