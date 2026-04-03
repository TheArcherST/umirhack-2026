import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Server, Activity, CheckCircle2, XCircle, Clock, ChevronRight, Plus } from 'lucide-react'
import { Header } from '@/components/Header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { stubGetStats, stubGetRecentTasks } from '@/api/stubs'
import { formatDate, formatDuration } from '@/lib/utils'
import type { Task } from '@/api/types'
import { TaskLogModal } from '@/components/TaskLogModal'
import { NewTaskModal } from '@/components/NewTaskModal'

function StatusBadge({ status }: { status: Task['status'] }) {
  const map = {
    success: <Badge variant="success">success</Badge>,
    failed: <Badge variant="destructive">failed</Badge>,
    timeout: <Badge variant="warning">timeout</Badge>,
    running: <Badge variant="blue">running</Badge>,
    pending: <Badge variant="muted">pending</Badge>,
  }
  return map[status] ?? null
}

function StatCard({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: number | string; sub?: string }) {
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

export default function Dashboard() {
  const navigate = useNavigate()
  const [logTaskId, setLogTaskId] = useState<string | null>(null)
  const [newTaskOpen, setNewTaskOpen] = useState(false)

  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: stubGetStats,
    refetchInterval: 15_000,
  })

  const { data: recentTasks = [], refetch: refetchTasks } = useQuery({
    queryKey: ['recent-tasks'],
    queryFn: () => stubGetRecentTasks(8),
    refetchInterval: 10_000,
  })

  return (
    <>
      <Header
        title="Dashboard"
        right={
          <Button size="sm" variant="outline" onClick={() => setNewTaskOpen(true)} className="gap-1.5 h-7 text-xs">
            <Plus size={12} />
            New task
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="p-5 space-y-6">
          {/* Stats grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard icon={Server} label="Total agents" value={stats?.total_agents ?? '—'} />
            <StatCard
              icon={Activity}
              label="Online now"
              value={stats?.online_agents ?? '—'}
              sub={stats ? `${stats.total_agents - stats.online_agents} offline` : undefined}
            />
            <StatCard icon={CheckCircle2} label="Successful" value={stats?.successful_tasks ?? '—'} sub="all time" />
            <StatCard icon={XCircle} label="Failed" value={stats?.failed_tasks ?? '—'} sub="all time" />
          </div>

          {/* Recent tasks */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recent tasks</h2>
            </div>

            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Time</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Agent</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">Command</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell">Duration</th>
                    <th className="px-4 py-2.5 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {recentTasks.map((task, i) => (
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
                        <StatusBadge status={task.status} />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground hidden sm:table-cell">
                        {formatDuration(task.duration)}
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
                  {recentTasks.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground">
                        No tasks yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <TaskLogModal taskId={logTaskId} onClose={() => setLogTaskId(null)} />
      <NewTaskModal
        open={newTaskOpen}
        onClose={() => setNewTaskOpen(false)}
        onCreated={() => { setNewTaskOpen(false); refetchTasks() }}
      />
    </>
  )
}
