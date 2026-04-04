import React, {useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {Plus, Link as LinkIcon, Pencil, Trash2, CheckCircle2, X} from 'lucide-react'
import {Header} from '@/components/Header'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Skeleton} from '@/components/ui/skeleton'
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover'
import {stubGetAgentInstallScript, stubGetAgents, stubGetEnvironments} from '@/api/stubs'
import {timeAgo} from '@/lib/utils'
import type {AgentStatus, Agent} from '@/api/types'
import {cn, copyText} from '@/lib/utils'
import {agentStatusLabelKey, agentStatusTextTone, agentStatusTone} from '@/lib/agentStatus'
import {useI18n} from '@/i18n'
import {useProject} from '@/hooks/useProject'
import {AddAgentModal} from '@/components/AddAgentModal'
import {EditAgentModal} from '@/components/EditAgentModal'
import {DeleteAgentModal} from '@/components/DeleteAgentModal'

type Filter = '' | AgentStatus

export default function ProjectAgents() {
    const [filter, setFilter] = useState<Filter>('')
    const [addOpen, setAddOpen] = useState(false)
    const [editAgent, setEditAgent] = useState<Agent | null>(null)
    const [deleteAgent, setDeleteAgent] = useState<Agent | null>(null)
    const [copiedId, setCopiedId] = useState<string | null>(null)
    const [fallbackData, setFallbackData] = useState<{agentId: string; command: string} | null>(null)
    const [actionError, setActionError] = useState('')
    const {t, locale} = useI18n()
    const {environments} = useProject()

    const {data: agents = [], isLoading, refetch} = useQuery({
        queryKey: ['agents-all', filter],
        queryFn: () => stubGetAgents(filter ? {status: filter} : undefined),
        refetchInterval: 15_000,
    })

    // Build env name lookup
    const envNames: Record<string, string> = {}
    environments.forEach((e) => {
        envNames[e.id] = e.name
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

    const copyInstallLink = async (agent: Agent) => {
        let command = ''
        try {
            const script = await stubGetAgentInstallScript(agent.id)
            setActionError('')
            command = script.command
        } catch (error: any) {
            setActionError(error?.message ?? 'Failed to issue install command')
            return
        }

        try {
            const copied = await copyText(command)
            if (!copied) throw new Error('Copy failed')
            setCopiedId(agent.id)
            setTimeout(() => setCopiedId(null), 1500)
        } catch {
            setFallbackData({agentId: agent.id, command})
        }
    }

    // Enrich agent with env names for EditAgentModal
    const enrichAgent = (agent: Agent): Agent & { _envNames: { id: string; name: string }[] } => ({
        ...agent,
        _envNames: environments.filter((e) => agent.environment_ids.includes(e.id)),
    })

    return (
        <>
            <Header
                title={t('agent.allAgents')}
                right={
                    <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}
                            className="gap-1.5 h-7 text-xs">
                        <Plus size={12}/>
                        {t('agent.addAgent')}
                    </Button>
                }
            />

            <div className="flex-1 overflow-y-auto">
                <div className="p-5 space-y-4">
                    {actionError && (
                        <p className="text-xs font-mono text-red-400">{actionError}</p>
                    )}
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
                                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell">{t('agent.operatingSystem')}</th>
                                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('common.status')}</th>
                                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">{t('common.environment')}</th>
                                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden lg:table-cell">{t('agents.lastHeartbeat')}</th>
                                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden lg:table-cell">{t('common.tasks')}</th>
                                <th className="px-4 py-2.5 w-24"/>
                            </tr>
                            </thead>
                            <tbody>
                            {isLoading && Array.from({length: 5}).map((_, i) => (
                                <tr key={i} className="border-b border-border/50 last:border-0">
                                    <td colSpan={7} className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <Skeleton className="h-4 flex-1" />
                                            <Skeleton className="h-5 w-14 rounded" />
                                            <Skeleton className="h-4 w-16" />
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {!isLoading && agents.map((agent) => (
                                <tr
                                    key={agent.id}
                                    className="border-b border-border/50 last:border-0 hover:bg-accent/30 transition-colors"
                                >
                                    <td className="px-4 py-3">
                                        <p className="text-xs font-mono font-medium">{agent.name}</p>
                                        <p className="text-xs text-muted-foreground">{agent.ip_address}</p>
                                        <p className="text-[10px] font-mono text-muted-foreground">
                                            {t('agent.installVersion')}: {agent.agent_version ?? '—'}
                                        </p>
                                        {agent.reported_agent_version && agent.reported_agent_version !== agent.agent_version && (
                                            <p className="text-[10px] font-mono text-amber-500">
                                                {t('agent.reportedVersion')}: {agent.reported_agent_version}
                                            </p>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 hidden sm:table-cell">
                                        <Badge variant="outline" className="uppercase text-[10px]">{agent.os}</Badge>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-1.5">
                        <span className={cn(
                            'w-1.5 h-1.5 rounded-full',
                            agentStatusTone(agent.status),
                        )}/>
                                            <span
                                                className={cn('text-xs font-mono', agentStatusTextTone(agent.status))}>
                          {t(agentStatusLabelKey(agent.status))}
                        </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 hidden md:table-cell">
                                        <div className="flex flex-wrap gap-1">
                                            {agent.environment_ids.map((envId) => (
                                                <Badge key={envId} variant="outline" className="text-[10px]">
                                                    {envNames[envId] ?? envId}
                                                </Badge>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 hidden lg:table-cell font-mono text-xs text-muted-foreground">
                                        {agent.last_heartbeat ? timeAgo(agent.last_heartbeat, locale) : t('common.never')}
                                    </td>
                                    <td className="px-4 py-3 hidden lg:table-cell font-mono text-xs text-muted-foreground">
                                        {agent.tasks_count}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-0.5">
                                            <Popover
                                                open={fallbackData?.agentId === agent.id}
                                                onOpenChange={(open) => !open && setFallbackData(null)}
                                            >
                                                <PopoverTrigger asChild>
                                                    <button
                                                        onClick={() => copyInstallLink(agent)}
                                                        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                                                        title={t('agent.copyScript')}
                                                    >
                                                        {copiedId === agent.id ? (
                                                            <CheckCircle2 size={13} className="text-green-400"/>
                                                        ) : (
                                                            <LinkIcon size={13}/>
                                                        )}
                                                    </button>
                                                </PopoverTrigger>
                                                <PopoverContent align="end" className="w-80 p-3 space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <p className="text-xs font-medium">{t('agent.copyScript')}</p>
                                                        <button
                                                            onClick={() => setFallbackData(null)}
                                                            className="p-0.5 rounded text-muted-foreground hover:text-foreground"
                                                        >
                                                            <X size={12}/>
                                                        </button>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground">{t('agents.autoCopyNotSupported')}</p>
                                                    <pre className="text-[11px] font-mono bg-muted/50 rounded p-2 break-all whitespace-pre-wrap select-all">
                                                        {fallbackData?.command}
                                                    </pre>
                                                </PopoverContent>
                                            </Popover>
                                            <button
                                                onClick={() => setEditAgent(enrichAgent(agent))}
                                                className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                                                title={t('agent.editAgent')}
                                            >
                                                <Pencil size={13}/>
                                            </button>
                                            <button
                                                onClick={() => setDeleteAgent(agent)}
                                                className="p-1.5 rounded text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors"
                                                title={t('agent.deleteAgent')}
                                            >
                                                <Trash2 size={13}/>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {!isLoading && agents.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-4 py-8 text-center text-xs text-muted-foreground">
                                        {t('agent.noAgents')}
                                    </td>
                                </tr>
                            )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <AddAgentModal
                open={addOpen}
                onClose={() => setAddOpen(false)}
                onCreated={() => refetch()}
            />
            <EditAgentModal
                agent={editAgent}
                open={!!editAgent}
                onClose={() => setEditAgent(null)}
                onUpdated={() => {
                    setEditAgent(null);
                    refetch()
                }}
            />
            <DeleteAgentModal
                agent={deleteAgent}
                open={!!deleteAgent}
                onClose={() => setDeleteAgent(null)}
                onDeleted={() => {
                    setDeleteAgent(null);
                    refetch()
                }}
            />
        </>
    )
}
