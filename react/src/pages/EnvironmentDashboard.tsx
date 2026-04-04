import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { Server, Activity, CheckCircle2, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  stubGetEnvironmentGraph,
  stubGetEnvironments,
  stubGetHosts,
  stubGetTasks,
} from '@/api/stubs'
import { agentStatusTone } from '@/lib/agentStatus'
import { formatDate, formatDuration } from '@/lib/utils'
import type { Task } from '@/api/types'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import EnvironmentGraph from '@/components/EnvironmentGraph'

function StatusBadge({ status }: { status: Task['status'] }) {
  const { t } = useI18n()
  const map: Record<Task['status'], React.ReactNode> = {
    success: <Badge variant="success">{t('common.success')}</Badge>,
    failed: <Badge variant="destructive">{t('common.failed')}</Badge>,
    timeout: <Badge variant="warning">{t('common.timeout')}</Badge>,
    running: <Badge variant="blue">{t('common.running')}</Badge>,
    pending: <Badge variant="muted">{t('common.pending')}</Badge>,
  }
  return map[status] ?? null
}

function StatCard({ icon: Icon, label, value, sub, loading }: { icon: React.ElementType; label: string; value: number | string; sub?: string; loading?: boolean }) {
  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-3 rounded" />
        </div>
        <Skeleton className="h-8 w-16" />
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
        <Icon size={13} className="text-muted-foreground/50" />
      </div>
      <div>
        <p className="text-2xl font-semibold font-display tracking-tight">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

export default function EnvironmentDashboard() {
  const navigate = useNavigate()
  const { envId } = useParams<{ envId: string }>()
  const { t } = useI18n()

  const { data: hosts = [], isLoading: isLoadingHosts } = useQuery({
    queryKey: ['hosts-env', envId],
    queryFn: () => stubGetHosts(envId!),
    refetchInterval: 15_000,
    enabled: !!envId,
  })

  const { data: envs, isLoading: isLoadingEnv } = useQuery({
    queryKey: ['environments'],
    queryFn: () => stubGetEnvironments(''),
  })
  const currentEnv = envs?.find((e) => e.id === envId)

  const { data: tasks = [], isLoading: isLoadingEnvTasks } = useQuery({
    queryKey: ['tasks-env', envId],
    queryFn: () => stubGetTasks({ agent_id: undefined, status: undefined, page: 1, per_page: 10 }).then((r) => r.items),
    refetchInterval: 10_000,
  })

  const envTasks = tasks.filter((task) => task.environment_id === envId)

  const { data: graphEdges = [], isLoading: isLoadingGraph } = useQuery({
    queryKey: ['graph-env', envId],
    queryFn: () => stubGetEnvironmentGraph(envId!),
    refetchInterval: 15_000,
    enabled: !!envId,
  })

  const online = hosts.filter((host) => host.status === 'online').length
  const stale = hosts.filter((host) => host.status === 'stale').length
  const offline = hosts.filter((host) => host.status === 'offline').length
  const nonOnline = stale + offline

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center px-5 border-b border-border bg-card/50 backdrop-blur-sm" style={{ height: 'var(--header-height)' }}>
        <h1 className="text-sm font-semibold text-foreground">
          {currentEnv?.name ?? 'Environment'} — {t('env.dashboard')}
        </h1>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="p-5 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard icon={Server} label={t('dashboard.totalAgents')} value={hosts.length} loading={isLoadingHosts} />
            <StatCard icon={Activity} label={t('dashboard.onlineNow')} value={online} sub={!isLoadingHosts && nonOnline > 0 ? `${nonOnline} ${t('common.offline').toLowerCase()}` : undefined} loading={isLoadingHosts} />
            <StatCard icon={CheckCircle2} label={t('dashboard.successful')} value={envTasks.filter((t) => t.status === 'success').length} loading={isLoadingEnvTasks} />
            <StatCard icon={XCircle} label={t('dashboard.failedTasks')} value={envTasks.filter((t) => t.status === 'failed').length} loading={isLoadingEnvTasks} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {t('dashboard.connectivity_graph')}
              </h2>
              {isLoadingGraph ? (
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-16" />
                </div>
              ) : (
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span>{hosts.filter((e) => e.status === 'online').length} {t('env.reachable')}</span>
                  <span>{hosts.filter((e) => e.status !== 'online').length} {t('env.unreachable')}</span>
                </div>
              )}
            </div>
            <div className="rounded-lg border border-border bg-card overflow-hidden" style={{ height: 360 }}>
              <EnvironmentGraph graphEdges={graphEdges} hosts={hosts} />
            </div>
          </div>

          {/* Hosts overview */}
          <div>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              {t('env.hosts')}
            </h2>
            {isLoadingHosts ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array.from({length: 3}).map((_, i) => (
                  <div key={i} className="rounded-lg border border-border bg-card p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="w-2 h-2 rounded-full" />
                    </div>
                    <Skeleton className="h-3 w-24" />
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-12 rounded" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {hosts.map((host) => (
                    <div
                      key={host.id}
                      className="rounded-lg border border-border bg-card p-4 hover:bg-accent/20 transition-colors cursor-pointer"
                      onClick={() => navigate(`/environments/${envId}/hosts/${host.id}`)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-mono font-medium">{host.name}</p>
                        <span className={cn('w-2 h-2 rounded-full', agentStatusTone(host.status))} />
                      </div>
                      <p className="text-xs text-muted-foreground font-mono">{host.primary_ipv4 ?? host.primary_ipv6 ?? '—'}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="outline" className="text-[10px] uppercase">{host.os_name ?? 'unknown'}</Badge>
                        <span className="text-xs text-muted-foreground">{host.hostname ?? host.name}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {hosts.length === 0 && (
                  <p className="text-xs text-muted-foreground">{t('env.noHosts')}</p>
                )}
              </>
            )}
          </div>

          {/* Recent tasks */}
          <div>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              {t('dashboard.recentTasks')}
            </h2>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('dashboard.time')}</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('common.agent')}</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">{t('common.command')}</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('common.status')}</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell">{t('common.duration')}</th>
                  </tr>
                </thead>
                <tbody>
                  {envTasks.map((task) => (
                    <tr key={task.id} className="border-b border-border/50 last:border-0 hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">{formatDate(task.created_at)}</td>
                      <td className="px-4 py-3 font-mono text-xs">{task.agent_name}</td>
                      <td className="px-4 py-3 hidden md:table-cell font-mono text-xs truncate max-w-[200px]">{task.command}</td>
                      <td className="px-4 py-3"><StatusBadge status={task.status} /></td>
                      <td className="px-4 py-3 hidden sm:table-cell font-mono text-xs text-muted-foreground">{formatDuration(task.duration)}</td>
                    </tr>
                  ))}
                  {envTasks.length === 0 && !isLoadingEnvTasks && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-muted-foreground">{t('env.noTasks')}</td></tr>
                  )}
                  {isLoadingEnvTasks && Array.from({length: 5}).map((_, i) => (
                    <tr key={i} className="border-b border-border/50 last:border-0">
                      <td colSpan={5} className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-4 flex-1" />
                          <Skeleton className="h-5 w-16 rounded" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
