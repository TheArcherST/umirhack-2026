import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, Plus, ChevronRight } from 'lucide-react'
import { Header } from '@/components/Header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { stubGetAgents, stubGetTasks } from '@/api/stubs'
import { formatDate, formatDuration } from '@/lib/utils'
import { TaskLogModal } from '@/components/TaskLogModal'
import { NewTaskModal } from '@/components/NewTaskModal'
import type { Task, TaskStatus } from '@/api/types'
import { cn } from '@/lib/utils'

type StatusFilter = '' | TaskStatus

function StatusBadge({ status }: { status: Task['status'] }) {
  const map: Record<Task['status'], React.ReactNode> = {
    success: <Badge variant="success">success</Badge>,
    failed: <Badge variant="destructive">failed</Badge>,
    timeout: <Badge variant="warning">timeout</Badge>,
    running: <Badge variant="blue">running</Badge>,
    pending: <Badge variant="muted">pending</Badge>,
  }
  return <>{map[status]}</>
}

export default function AgentTasks() {
  const { agentId } = useParams<{ agentId: string }>()
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('')
  const [page, setPage] = useState(1)
  const [logTaskId, setLogTaskId] = useState<string | null>(null)
  const [newTaskOpen, setNewTaskOpen] = useState(false)

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => stubGetAgents(),
  })
  const agent = agents.find((a) => a.id === agentId)

  const { data: tasksPage, refetch } = useQuery({
    queryKey: ['tasks', agentId, statusFilter, page],
    queryFn: () =>
      stubGetTasks({
        agent_id: agentId,
        status: statusFilter || undefined,
        page,
        per_page: 20,
      }),
    refetchInterval: 8_000,
  })

  const tasks = tasksPage?.items ?? []
  const totalPages = tasksPage?.total_pages ?? 1

  const STATUS_FILTERS: [StatusFilter, string][] = [
    ['', 'All'],
    ['success', 'Success'],
    ['failed', 'Failed'],
    ['timeout', 'Timeout'],
    ['pending', 'Pending'],
  ]

  return (
    <>
      <Header
        title={agent?.name ?? 'Agent tasks'}
        backButton={
          <button
            onClick={() => navigate('/agents')}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors mr-1"
          >
            <ChevronLeft size={15} />
          </button>
        }
        right={
          <div className="flex items-center gap-2">
            {agent && (
              <div className="flex items-center gap-1.5 mr-2">
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full',
                    agent.status === 'online' ? 'bg-green-400 status-pulse' : 'bg-muted-foreground/40',
                  )}
                />
                <span className={cn('text-xs font-mono', agent.status === 'online' ? 'text-green-400' : 'text-muted-foreground')}>
                  {agent.ip_address}
                </span>
              </div>
            )}
            <Button size="sm" variant="outline" onClick={() => setNewTaskOpen(true)} className="gap-1.5 h-7 text-xs">
              <Plus size={12} />
              New task
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="p-5 space-y-4">
          {/* Status filter */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {STATUS_FILTERS.map(([val, label]) => (
              <button
                key={val}
                onClick={() => { setStatusFilter(val); setPage(1) }}
                className={cn(
                  'px-3 py-1.5 rounded text-xs font-medium transition-colors',
                  statusFilter === val
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                )}
              >
                {label}
              </button>
            ))}

            {tasksPage && (
              <span className="ml-auto text-xs font-mono text-muted-foreground">
                {tasksPage.total} task{tasksPage.total !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Table */}
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground font-mono">#</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Command</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell">Duration</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">Started</th>
                  <th className="px-4 py-2.5 w-10" />
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr
                    key={task.id}
                    className="border-b border-border/50 last:border-0 hover:bg-accent/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground/50">
                      {task.id.split('-').pop()}
                    </td>
                    <td className="px-4 py-3 max-w-[280px]">
                      <span className="font-mono text-xs truncate block" title={task.command}>
                        {task.command}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={task.status} />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground hidden sm:table-cell">
                      {formatDuration(task.duration)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground hidden md:table-cell">
                      {task.started_at ? formatDate(task.started_at) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setLogTaskId(task.id)}
                        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      >
                        <ChevronRight size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
                {tasks.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground">
                      No tasks found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="h-7 text-xs"
              >
                Previous
              </Button>
              <span className="text-xs font-mono text-muted-foreground">
                Page {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="h-7 text-xs"
              >
                Next
              </Button>
            </div>
          )}
        </div>
      </div>

      <TaskLogModal taskId={logTaskId} onClose={() => setLogTaskId(null)} />
      <NewTaskModal
        open={newTaskOpen}
        onClose={() => setNewTaskOpen(false)}
        defaultAgentId={agentId}
        onCreated={() => { setNewTaskOpen(false); refetch() }}
      />
    </>
  )
}
