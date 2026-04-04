import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, Cpu, Network, Server, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { stubGetHost, stubGetHostInfo, stubGetHostServices, stubGetRecentTasks } from '@/api/stubs'
import { formatDate, formatDuration, cn } from '@/lib/utils'
import { agentStatusLabelKey, agentStatusTextTone, agentStatusTone } from '@/lib/agentStatus'
import { TaskLogModal } from '@/components/TaskLogModal'
import { DeleteHostModal } from '@/components/DeleteHostModal'
import type { Task } from '@/api/types'
import { useI18n } from '@/i18n'

function StatusBadge({ status }: { status: Task['status'] }) {
  const { t } = useI18n()
  const map: Record<Task['status'], React.ReactNode> = {
    success: <Badge variant="success">{t('common.success')}</Badge>,
    failed: <Badge variant="destructive">{t('common.failed')}</Badge>,
    timeout: <Badge variant="warning">{t('common.timeout')}</Badge>,
    running: <Badge variant="blue">{t('common.running')}</Badge>,
    pending: <Badge variant="muted">{t('common.pending')}</Badge>,
  }
  return <>{map[status]}</>
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-mono text-foreground">{value}</span>
    </div>
  )
}

export default function EnvironmentHostDetail() {
  const { envId, hostId } = useParams<{ envId: string; hostId: string }>()
  const navigate = useNavigate()
  const { t } = useI18n()
  const [logTaskId, setLogTaskId] = React.useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = React.useState(false)

  const { data: host } = useQuery({
    queryKey: ['host', hostId],
    queryFn: () => stubGetHost(hostId!),
    enabled: !!hostId,
  })

  const { data: hostInfo, isLoading: loadingHost } = useQuery({
    queryKey: ['host-info', hostId],
    queryFn: () => stubGetHostInfo(hostId!),
    enabled: !!hostId,
  })

  const { data: hostServices, isLoading: loadingServices } = useQuery({
    queryKey: ['host-services', hostId],
    queryFn: () => stubGetHostServices(hostId!),
    enabled: !!hostId,
  })

  const { data: recentTasks = [], isLoading: isLoadingHostTasks, refetch } = useQuery({
    queryKey: ['host-recent-tasks', hostId],
    queryFn: () => stubGetRecentTasks(10).then((tasks) =>
      hostId ? tasks.filter((t) => t.host_id === hostId) : tasks,
    ),
    refetchInterval: 8_000,
  })

  const services = hostServices?.services ?? []
  const ports = hostServices?.ports ?? []

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center px-5 border-b border-border bg-card/50 backdrop-blur-sm" style={{ height: 'var(--header-height)' }}>
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => navigate(`/environments/${envId}/hosts`)}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors mr-2"
          >
            <ChevronLeft size={15} />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-sm font-semibold text-foreground font-mono truncate">
              {host?.name ?? hostId}
            </h1>
            {host && (
              <div className="flex items-center gap-1.5">
                <span className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  agentStatusTone(host.status),
                )} />
                <span className={cn(
                  'text-xs font-mono',
                  agentStatusTextTone(host.status),
                )}>
                  {t(agentStatusLabelKey(host.status))}
                </span>
              </div>
            )}
          </div>
        </div>
        {host && (
          <Button
            size="sm"
            variant="destructive"
            className="ml-auto h-7 gap-1.5 text-xs"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 size={12} />
            {t('env.deleteHost')}
          </Button>
        )}
      </header>

      <DeleteHostModal
        host={host ?? null}
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => navigate(`/environments/${envId}/hosts`)}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="p-5 space-y-5">
          {/* Top: two columns */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Left: Host Info */}
            <div className="rounded-lg border border-border bg-card">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
                <Server size={13} className="text-muted-foreground" />
                <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  {t('env.hostInfo')}
                </h2>
              </div>
              {loadingHost || !hostInfo ? (
                <div className="px-4 py-3 space-y-3">
                  {Array.from({length: 7}).map((_, i) => (
                    <div key={i} className="flex items-center justify-between py-2.5 border-b border-border/50">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-2">
                  <InfoRow label={t('env.hostname')} value={hostInfo.hostname} />
                  <InfoRow label={t('env.osVersion')} value={`${hostInfo.os_name} ${hostInfo.os_version}`} />
                  <InfoRow label={t('env.kernel')} value={hostInfo.kernel} />
                  <InfoRow label={t('env.cpuModel')} value={hostInfo.cpu_model} />
                  <InfoRow label={t('env.cpuCores')} value={hostInfo.cpu_cores} />
                  <InfoRow label={t('env.memoryTotal')} value={`${(hostInfo.memory_total_mb / 1024).toFixed(1)} GB`} />
                  <InfoRow label={t('env.uptime')} value={hostInfo.uptime} />
                  <InfoRow
                    label={t('env.ipAddress')}
                    value={
                      <div className="flex flex-wrap gap-1 justify-end">
                        {hostInfo.ip_addresses.map((ip) => (
                          <Badge key={ip} variant="outline" className="text-[10px] font-mono">{ip}</Badge>
                        ))}
                      </div>
                    }
                  />
                </div>
              )}
            </div>

            {/* Right: Services + Ports */}
            <div className="space-y-5">
              {/* Services */}
              <div className="rounded-lg border border-border bg-card">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
                  <Cpu size={13} className="text-muted-foreground" />
                  <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    {t('env.services')}
                  </h2>
                  {services.length > 0 && (
                    <span className="ml-auto text-[10px] font-mono text-muted-foreground">{services.length}</span>
                  )}
                </div>
                {loadingServices ? (
                  <div className="px-4 py-3 space-y-2">
                    {Array.from({length: 3}).map((_, i) => (
                      <div key={i} className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
                        <div className="flex items-center gap-2">
                          <Skeleton className="w-1.5 h-1.5 rounded-full" />
                          <Skeleton className="h-4 w-20" />
                        </div>
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-4 w-10" />
                          <Skeleton className="h-4 w-16 rounded" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : services.length === 0 ? (
                  <div className="px-4 py-6 text-xs text-muted-foreground">{t('common.noResults')}</div>
                ) : (
                  <div className="px-4 py-2">
                    {services.map((svc) => (
                      <div key={svc.name} className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            'w-1.5 h-1.5 rounded-full',
                            svc.status === 'running' ? 'bg-green-400' : 'bg-red-400',
                          )} />
                          <span className="text-xs font-mono">{svc.name}</span>
                          {svc.known && (
                            <Badge variant="outline" className="text-[9px] text-muted-foreground">known</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {svc.port != null && (
                            <span className="text-[10px] font-mono text-muted-foreground">:{svc.port}</span>
                          )}
                          <Badge
                            variant={svc.status === 'running' ? 'success' : 'destructive'}
                            className="text-[9px]"
                          >
                            {svc.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Ports */}
              <div className="rounded-lg border border-border bg-card">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
                  <Network size={13} className="text-muted-foreground" />
                  <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    {t('env.ports')}
                  </h2>
                  {ports.length > 0 && (
                    <span className="ml-auto text-[10px] font-mono text-muted-foreground">{ports.length}</span>
                  )}
                </div>
                {loadingServices ? (
                  <div className="px-4 py-3 space-y-2">
                    {Array.from({length: 3}).map((_, i) => (
                      <div key={i} className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-4 w-12" />
                          <Skeleton className="h-4 w-14 rounded" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                        <Skeleton className="h-4 w-12 rounded" />
                      </div>
                    ))}
                  </div>
                ) : ports.length === 0 ? (
                  <div className="px-4 py-6 text-xs text-muted-foreground">{t('common.noResults')}</div>
                ) : (
                  <div className="px-4 py-2">
                    {ports.map((p) => (
                      <div key={`${p.port}-${p.protocol}`} className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono">{p.port}</span>
                          <Badge variant="outline" className="text-[9px] uppercase">{p.protocol}</Badge>
                          {p.service && (
                            <span className="text-[10px] text-muted-foreground font-mono">{p.service}</span>
                          )}
                        </div>
                        <Badge variant="muted" className="text-[9px]">{p.state}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bottom: Recent tasks */}
          <div>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              {t('dashboard.recentTasks')}
            </h2>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('dashboard.time')}</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">{t('common.command')}</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('common.status')}</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell">{t('common.duration')}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTasks.map((task) => (
                    <tr
                      key={task.id}
                      className="border-b border-border/50 last:border-0 hover:bg-accent/30 transition-colors cursor-pointer"
                      onClick={() => setLogTaskId(task.id)}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(task.created_at)}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell font-mono text-xs truncate max-w-[250px]">
                        {task.command}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={task.status} /></td>
                      <td className="px-4 py-3 hidden sm:table-cell font-mono text-xs text-muted-foreground">
                        {formatDuration(task.duration)}
                      </td>
                    </tr>
                  ))}
                  {recentTasks.length === 0 && !isLoadingHostTasks && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-xs text-muted-foreground">
                        {t('env.noTasks')}
                      </td>
                    </tr>
                  )}
                  {isLoadingHostTasks && Array.from({length: 5}).map((_, i) => (
                    <tr key={i} className="border-b border-border/50 last:border-0">
                      <td colSpan={4} className="px-4 py-3">
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

      <TaskLogModal taskId={logTaskId} onClose={() => setLogTaskId(null)} />
    </div>
  )
}
