import React, {useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {useNavigate} from 'react-router-dom'
import {ChevronRight} from 'lucide-react'
import {Header} from '@/components/Header'
import {Badge} from '@/components/ui/badge'
import {stubGetAgents} from '@/api/stubs'
import {timeAgo} from '@/lib/utils'
import type {AgentStatus} from '@/api/types'
import {cn} from '@/lib/utils'
import {agentStatusLabelKey, agentStatusTextTone, agentStatusTone} from '@/lib/agentStatus'
import {useI18n} from '@/i18n'

type Filter = '' | AgentStatus

export default function Agents() {
    const navigate = useNavigate()
    const [filter, setFilter] = useState<Filter>('')
    const {t} = useI18n()

    const {data: agents = [], isLoading} = useQuery({
        queryKey: ['agents', filter],
        queryFn: () => stubGetAgents(filter ? {status: filter} : undefined),
        refetchInterval: 15_000,
    })

    const online = agents.filter((a) => a.status === 'online').length
    const stale = agents.filter((a) => a.status === 'stale').length
    const offline = agents.filter((a) => a.status === 'offline').length

    const filters: [Filter, string, string?, string?][] = [
        ['', t('common.all')],
        ['online', t('common.online'), 'text-green-400', String(online)],
        ['stale', t('common.stale'), 'text-amber-400', String(stale)],
        ['offline', t('common.offline'), 'text-muted-foreground/60', String(offline)],
    ]

    return (
        <>
            <Header title={t('agents.title')}/>

            <div className="flex-1 overflow-y-auto">
                <div className="p-5 space-y-4">
                    {/* Filter bar */}
                    <div className="flex items-center gap-2">
                        {filters.map(([val, label, color, count]) => (
                            <button
                                key={val}
                                onClick={() => setFilter(val)}
                                className={cn(
                                    'px-3 py-1.5 rounded text-xs font-medium transition-colors',
                                    filter === val
                                        ? 'bg-accent text-foreground'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
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
                                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell">{t('agents.ipHost')}</th>
                                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('common.status')}</th>
                                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">{t('agents.lastHeartbeat')}</th>
                                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden lg:table-cell">{t('common.tasks')}</th>
                                <th className="px-4 py-2.5 w-10"/>
                            </tr>
                            </thead>
                            <tbody>
                            {isLoading && (
                                <tr>
                                    <td colSpan={6}
                                        className="px-4 py-8 text-center text-xs text-muted-foreground">{t('common.loading')}</td>
                                </tr>
                            )}
                            {!isLoading && agents.map((agent) => (
                                <tr
                                    key={agent.id}
                                    className="border-b border-border/50 last:border-0 hover:bg-accent/30 transition-colors cursor-pointer"
                                    onClick={() => navigate(`/agents/${agent.id}/tasks`)}
                                >
                                    <td className="px-4 py-3">
                                        <div>
                                            <p className="text-xs font-mono font-medium">{agent.name}</p>
                                            <p className="text-[10px] font-mono text-muted-foreground">
                                                {t('agent.installVersion')}: {agent.agent_version ?? '—'}
                                            </p>
                                            {agent.reported_agent_version && agent.reported_agent_version !== agent.agent_version && (
                                                <p className="text-[10px] font-mono text-amber-500">
                                                    {t('agent.reportedVersion')}: {agent.reported_agent_version}
                                                </p>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 hidden sm:table-cell">
                                        <p className="font-mono text-xs text-muted-foreground">{agent.ip_address}</p>
                                        <p className="font-mono text-[10px] text-muted-foreground/50">{agent.hostname}</p>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-1.5">
                        <span
                            className={cn(
                                'w-1.5 h-1.5 rounded-full',
                                agentStatusTone(agent.status),
                            )}
                        />
                                            <span
                                                className={cn('text-xs font-mono', agentStatusTextTone(agent.status))}>
                          {t(agentStatusLabelKey(agent.status))}
                        </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 hidden md:table-cell font-mono text-xs text-muted-foreground">
                                        {timeAgo(agent.last_heartbeat)}
                                    </td>
                                    <td className="px-4 py-3 hidden lg:table-cell font-mono text-xs text-muted-foreground">
                                        {agent.tasks_count}
                                    </td>
                                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                        <button
                                            onClick={() => navigate(`/agents/${agent.id}/tasks`)}
                                            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                                        >
                                            <ChevronRight size={13}/>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {!isLoading && agents.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground">
                                        {t('agents.noAgents')}
                                    </td>
                                </tr>
                            )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </>
    )
}
