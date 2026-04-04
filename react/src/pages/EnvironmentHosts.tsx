import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { stubGetHosts } from '@/api/stubs'
import { timeAgo } from '@/lib/utils'
import type { AgentStatus } from '@/api/types'
import { cn } from '@/lib/utils'
import { useI18n } from '@/i18n'

type Filter = '' | AgentStatus

export default function EnvironmentHosts() {
  const navigate = useNavigate()
  const { envId } = useParams<{ envId: string }>()
  const [filter, setFilter] = useState<Filter>('')
  const { t } = useI18n()

  const { data: hosts = [], isLoading } = useQuery({
    queryKey: ['hosts-env', envId, filter],
    queryFn: async () => {
      const rows = await stubGetHosts(envId!)
      return filter ? rows.filter((host) => host.status === filter) : rows
    },
    refetchInterval: 15_000,
    enabled: !!envId,
  })

  const online = hosts.filter((host) => host.status === 'online').length
  const offline = hosts.length - online

  const filters: [Filter, string, string?, string?][] = [
    ['', t('common.all')],
    ['online', t('common.online'), 'text-green-400', String(online)],
    ['offline', t('common.offline'), 'text-muted-foreground/60', String(offline)],
  ]

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="flex items-center px-5 border-b border-border bg-card/50 backdrop-blur-sm" style={{ height: 'var(--header-height)' }}>
        <h1 className="text-sm font-semibold text-foreground">{t('env.hosts')}</h1>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="p-5 space-y-4">
          {/* Filter */}
          <div className="flex items-center gap-2">
            {filters.map(([val, label, color, count]) => (
              <button
                key={val}
                onClick={() => setFilter(val)}
                className={cn(
                  'px-3 py-1.5 rounded text-xs font-medium transition-colors',
                  filter === val ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                )}
              >
                {label}
                {count != null && <span className={cn('ml-1.5 font-mono', color)}>{count}</span>}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('common.agent')}</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell">{t('agent.operatingSystem')}</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('common.status')}</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">{t('agents.lastHeartbeat')}</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden lg:table-cell">{t('common.tasks')}</th>
                  <th className="px-4 py-2.5 w-10" />
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground">{t('common.loading')}</td></tr>
                )}
                {!isLoading && hosts.map((host) => (
                  <tr
                    key={host.id}
                    className="border-b border-border/50 last:border-0 hover:bg-accent/30 transition-colors cursor-pointer"
                    onClick={() => navigate(`/environments/${envId}/hosts/${host.id}`)}
                  >
                    <td className="px-4 py-3">
                      <p className="text-xs font-mono font-medium">{host.name}</p>
                      <p className="text-xs text-muted-foreground">{host.primary_ipv4 ?? host.primary_ipv6 ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <Badge variant="outline" className="uppercase text-[10px]">{host.os_name ?? 'unknown'}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className={cn('w-1.5 h-1.5 rounded-full', host.status === 'online' ? 'bg-green-400 status-pulse' : 'bg-muted-foreground/40')} />
                        <span className={cn('text-xs font-mono', host.status === 'online' ? 'text-green-400' : 'text-muted-foreground')}>
                          {host.status === 'online' ? t('common.online') : t('common.offline')}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell font-mono text-xs text-muted-foreground">{timeAgo(host.last_seen_at)}</td>
                    <td className="px-4 py-3 hidden lg:table-cell font-mono text-xs text-muted-foreground">{host.hostname ?? host.name}</td>
                    <td className="px-4 py-3">
                      <button className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                        <ChevronRight size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
                {!isLoading && hosts.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground">{t('env.noHosts')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
