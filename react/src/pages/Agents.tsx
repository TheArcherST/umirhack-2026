import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Circle } from 'lucide-react'
import { Header } from '@/components/Header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { stubGetAgents } from '@/api/stubs'
import { timeAgo } from '@/lib/utils'
import type { AgentStatus } from '@/api/types'
import { cn } from '@/lib/utils'

type Filter = '' | AgentStatus

export default function Agents() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('')

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['agents', filter],
    queryFn: () => stubGetAgents(filter ? { status: filter } : undefined),
    refetchInterval: 15_000,
  })

  const online = agents.filter((a) => a.status === 'online').length
  const offline = agents.filter((a) => a.status === 'offline').length

  return (
    <>
      <Header title="Agents" />

      <div className="flex-1 overflow-y-auto">
        <div className="p-5 space-y-4">
          {/* Filter bar */}
          <div className="flex items-center gap-2">
            {([['', 'All'], ['online', 'Online'], ['offline', 'Offline']] as [Filter, string][]).map(([val, label]) => (
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
                {val === 'online' && <span className="ml-1.5 font-mono text-green-400">{online}</span>}
                {val === 'offline' && <span className="ml-1.5 font-mono text-muted-foreground/60">{offline}</span>}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Agent</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell">IP / Host</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">Last heartbeat</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden lg:table-cell">Tasks</th>
                  <th className="px-4 py-2.5 w-10" />
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground">Loading…</td>
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
                            agent.status === 'online' ? 'bg-green-400 status-pulse' : 'bg-muted-foreground/40',
                          )}
                        />
                        <span className={cn('text-xs font-mono', agent.status === 'online' ? 'text-green-400' : 'text-muted-foreground')}>
                          {agent.status}
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
                        <ChevronRight size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
                {!isLoading && agents.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground">
                      No agents found
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
