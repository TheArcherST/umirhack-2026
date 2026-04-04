import React, {useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {useNavigate} from 'react-router-dom'
import {
    Server,
    Activity,
    CheckCircle2,
    XCircle,
    ChevronRight,
    FolderOpen,
    Plus,
} from 'lucide-react'
import {Header} from '@/components/Header'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {stubGetStats, stubGetRecentTasks, stubGetEnvironments, stubGetAgents} from '@/api/stubs'
import {formatDate, formatDuration, timeAgo} from '@/lib/utils'
import type {Task, Environment, Agent} from '@/api/types'
import {TaskLogModal} from '@/components/TaskLogModal'
import {useI18n} from '@/i18n'
import {useProject} from '@/hooks/useProject'
import {cn} from '@/lib/utils'
import {CreateProjectModal} from '@/components/CreateProjectModal'

function StatusBadge({status}: { status: Task['status'] }) {
    const {t} = useI18n()
    const map: Record<Task['status'], React.ReactNode> = {
        success: <Badge variant="success">{t('common.success')}</Badge>,
        failed: <Badge variant="destructive">{t('common.failed')}</Badge>,
        timeout: <Badge variant="warning">{t('common.timeout')}</Badge>,
        running: <Badge variant="blue">{t('common.running')}</Badge>,
        pending: <Badge variant="muted">{t('common.pending')}</Badge>,
    }
    return map[status] ?? null
}

function StatCard({icon: Icon, label, value, sub}: {
    icon: React.ElementType;
    label: string;
    value: number | string;
    sub?: string
}) {
    return (
        <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium">{label}</span>
                <Icon size={13} className="text-muted-foreground/50"/>
            </div>
            <div>
                <p className="text-2xl font-semibold font-display tracking-tight">{value}</p>
                {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
            </div>
        </div>
    )
}

function EnvCard({env, agents}: { env: Environment; agents: Agent[] }) {
    const {t} = useI18n()
    const navigate = useNavigate()
    const online = agents.filter((a) => a.status === 'online').length
    const total = agents.length

    return (
        <div
            className="rounded-lg border border-border bg-card p-4 hover:bg-accent/20 transition-colors cursor-pointer"
            onClick={() => navigate(`/environments/${env.id}`)}
        >
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <FolderOpen size={14} className="text-muted-foreground"/>
                    <span className="text-sm font-semibold font-display">{env.name}</span>
                </div>
                <ChevronRight size={14} className="text-muted-foreground"/>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                    <span
                        className={cn('w-1.5 h-1.5 rounded-full', total > 0 && online === total ? 'bg-green-400' : online > 0 ? 'bg-amber-400' : 'bg-muted-foreground/40')}/>
                    <span className="font-mono">{online}/{total}</span>
                    <span>{t('common.online')}</span>
                </div>
                <span className="font-mono">{t('project.agentsInEnv', {count: total})}</span>
            </div>
        </div>
    )
}

export default function Dashboard() {
    const navigate = useNavigate()
    const {t} = useI18n()
    const {currentProject, createProject} = useProject()
    const [logTaskId, setLogTaskId] = useState<string | null>(null)
    const [createOpen, setCreateOpen] = useState(false)

    // Load stats
    const {data: stats} = useQuery({
        queryKey: ['stats', currentProject?.id],
        queryFn: stubGetStats,
        refetchInterval: 15_000,
        enabled: !!currentProject,
    })

    // Load all agents (across all envs)
    const {data: allAgents = []} = useQuery({
        queryKey: ['agents-all', currentProject?.id],
        queryFn: () => stubGetAgents(),
        refetchInterval: 15_000,
        enabled: !!currentProject,
    })

    // Load recent tasks
    const {data: recentTasks = []} = useQuery({
        queryKey: ['recent-tasks', currentProject?.id],
        queryFn: () => stubGetRecentTasks(8),
        refetchInterval: 10_000,
        enabled: !!currentProject,
    })

    // Load envs
    const {data: envs} = useQuery({
        queryKey: ['environments', currentProject?.id],
        queryFn: () => stubGetEnvironments(currentProject?.id ?? ''),
        enabled: !!currentProject,
    })

    // Group agents by environment
    const agentsByEnv: Record<string, Agent[]> = {}
    allAgents.forEach((a) => {
        a.environment_ids.forEach((envId) => {
            if (!agentsByEnv[envId]) agentsByEnv[envId] = []
            agentsByEnv[envId].push(a)
        })
    })

    if (!currentProject) {
        return (
            <>
                <Header title={t('dashboard.title')}/>

                <div className="flex-1 overflow-y-auto">
                    <div className="min-h-full p-5 flex items-center justify-center">
                        <div className="w-full max-w-2xl rounded-2xl border border-border bg-card overflow-hidden">
                            <div className="px-8 py-10 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.08),_transparent_45%),linear-gradient(135deg,rgba(255,255,255,0.04),transparent_60%)]">
                                <div className="w-12 h-12 rounded-xl border border-border/80 bg-background/80 flex items-center justify-center mb-5">
                                    <FolderOpen size={20} className="text-foreground/70"/>
                                </div>
                                <h2 className="text-2xl font-semibold font-display tracking-tight">
                                    {t('project.noProjectTitle')}
                                </h2>
                                <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                                    {t('project.noProjectDescription')}
                                </p>
                                <div className="mt-6 flex items-center gap-3">
                                    <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
                                        <Plus size={13}/>
                                        {t('project.createProject')}
                                    </Button>
                                </div>
                            </div>

                            <div className="px-8 py-6 border-t border-border bg-background/40">
                                <div className="grid gap-3 sm:grid-cols-3">
                                    <div className="rounded-lg border border-border/70 p-4">
                                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                                            {t('project.emptyStepProject')}
                                        </p>
                                        <p className="mt-1 text-sm text-foreground/80">
                                            {t('project.emptyStepProjectDesc')}
                                        </p>
                                    </div>
                                    <div className="rounded-lg border border-border/70 p-4">
                                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                                            {t('project.emptyStepEnvironment')}
                                        </p>
                                        <p className="mt-1 text-sm text-foreground/80">
                                            {t('project.emptyStepEnvironmentDesc')}
                                        </p>
                                    </div>
                                    <div className="rounded-lg border border-border/70 p-4">
                                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                                            {t('project.emptyStepAgent')}
                                        </p>
                                        <p className="mt-1 text-sm text-foreground/80">
                                            {t('project.emptyStepAgentDesc')}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <CreateProjectModal
                    open={createOpen}
                    onClose={() => setCreateOpen(false)}
                    onCreate={createProject}
                />
            </>
        )
    }

    return (
        <>
            <Header title={t('dashboard.title')}/>

            <div className="flex-1 overflow-y-auto">
                <div className="p-5 space-y-6">
                    {/* Stats grid — across all envs */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <StatCard icon={Server} label={t('dashboard.totalAgents')} value={stats?.total_agents ?? '—'}/>
                        <StatCard
                            icon={Activity}
                            label={t('dashboard.onlineNow')}
                            value={stats?.online_agents ?? '—'}
                            sub={stats ? t('dashboard.offlineCount', {count: stats.total_agents - stats.online_agents}) : undefined}
                        />
                        <StatCard icon={CheckCircle2} label={t('dashboard.successful')}
                                  value={stats?.successful_tasks ?? '—'} sub={t('dashboard.allTime')}/>
                        <StatCard icon={XCircle} label={t('dashboard.failedTasks')} value={stats?.failed_tasks ?? '—'}
                                  sub={t('dashboard.allTime')}/>
                    </div>

                    {/* Environments overview */}
                    {envs && envs.length > 0 && (
                        <div>
                            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                                {t('project.allEnvironments')}
                            </h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {envs.map((env) => (
                                    <EnvCard key={env.id} env={env} agents={agentsByEnv[env.id] ?? []}/>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Recent tasks — across all envs */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('dashboard.recentTasks')}</h2>
                        </div>

                        <div className="rounded-lg border border-border overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                <tr className="border-b border-border bg-muted/30">
                                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('dashboard.time')}</th>
                                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('common.agent')}</th>
                                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">{t('common.command')}</th>
                                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('common.status')}</th>
                                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell">{t('common.duration')}</th>
                                    <th className="px-4 py-2.5 w-10"/>
                                </tr>
                                </thead>
                                <tbody>
                                {recentTasks.map((task) => (
                                    <tr
                                        key={task.id}
                                        className="border-b border-border/50 last:border-0 hover:bg-accent/30 transition-colors"
                                    >
                                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                                            {formatDate(task.created_at)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <button
                                                onClick={() => navigate(`/agents/${task.agent_id}/tasks`)}
                                                className="text-xs font-mono hover:text-foreground text-muted-foreground transition-colors"
                                            >
                                                {task.agent_name}
                                            </button>
                                        </td>
                                        <td className="px-4 py-3 hidden md:table-cell max-w-[200px]">
                        <span className="font-mono text-xs truncate block" title={task.command}>
                          {task.command}
                        </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <StatusBadge status={task.status}/>
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground hidden sm:table-cell">
                                            {formatDuration(task.duration)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <button
                                                onClick={() => setLogTaskId(task.id)}
                                                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                                            >
                                                <ChevronRight size={13}/>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {recentTasks.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground">
                                            {t('dashboard.noTasks')}
                                        </td>
                                    </tr>
                                )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <TaskLogModal taskId={logTaskId} onClose={() => setLogTaskId(null)}/>
        </>
    )
}
