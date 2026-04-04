import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { stubGetEnvironments, stubGetRecentTasks } from '@/api/stubs'
import { formatDate, formatDuration, cn } from '@/lib/utils'
import { TaskLogModal } from '@/components/TaskLogModal'
import { CreateTaskModal } from '@/components/CreateTaskModal'
import type { Task, TaskStatus } from '@/api/types'
import { useI18n } from '@/i18n'

type StatusFilter = '' | TaskStatus

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

export default function EnvironmentTasks() {
  const { envId } = useParams<{ envId: string }>()
  const navigate = useNavigate()
  const { t } = useI18n()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('')
  const [page, setPage] = useState(1)
  const [logTaskId, setLogTaskId] = useState<string | null>(null)
  const [createTaskOpen, setCreateTaskOpen] = useState(false)

  const { data: envs } = useQuery({
    queryKey: ['environments'],
    queryFn: () => stubGetEnvironments(''),
  })
  const currentEnv = envs?.find((e) => e.id === envId)

  const { data: tasksPage, isLoading: isLoadingTasks, refetch } = useQuery({
    queryKey: ['env-tasks', envId, statusFilter, page],
    queryFn: async () => {
      const allTasks = await stubGetRecentTasks(200)
      const filtered = allTasks.filter(
        (task) => task.environment_id === envId && (!statusFilter || task.status === statusFilter),
      )
      const perPage = 20
      const start = (page - 1) * perPage
      return {
        items: filtered.slice(start, start + perPage),
        total: filtered.length,
        page,
        per_page: perPage,
        total_pages: Math.ceil(filtered.length / perPage),
      }
    },
    refetchInterval: 8_000,
  })

  const tasks = tasksPage?.items ?? []
  const totalPages = tasksPage?.total_pages ?? 1

  const STATUS_FILTERS: [StatusFilter, string][] = [
    ['', t('common.all')],
    ['success', t('common.success')],
    ['failed', t('common.failed')],
    ['timeout', t('common.timeout')],
    ['pending', t('common.pending')],
  ]

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-5 border-b border-border bg-card/50 backdrop-blur-sm" style={{ height: 'var(--header-height)' }}>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/environments/${envId}`)}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors mr-1"
          >
            <ChevronLeft size={15} />
          </button>
          <h1 className="text-sm font-semibold text-foreground">
            {currentEnv?.name ?? 'Environment'} — {t('env.tasks')}
          </h1>
        </div>
        <Button size="sm" variant="outline" onClick={() => setCreateTaskOpen(true)} className="gap-1.5 h-7 text-xs">
          <Plus size={12} />
          {t('env.createTask')}
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="p-5 space-y-4">
          {/* Status filter */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {STATUS_FILTERS.map(([val, label]) => (
              <button
                key={val}
                onClick={() => {
                  setStatusFilter(val)
                  setPage(1)
                }}
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
                {tasksPage.total === 1 ? t('agentTasks.taskCount', { count: tasksPage.total }) : t('agentTasks.taskCountPlural', { count: tasksPage.total })}
              </span>
            )}
          </div>

          {/* Table */}
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('dashboard.time')}</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('common.agent')}</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">{t('common.command')}</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('common.status')}</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell">{t('common.duration')}</th>
                  <th className="px-4 py-2.5 w-10" />
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr
                    key={task.id}
                    className="border-b border-border/50 last:border-0 hover:bg-accent/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(task.created_at)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{task.agent_name}</td>
                    <td className="px-4 py-3 hidden md:table-cell font-mono text-xs truncate max-w-[250px]">
                      {task.command}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={task.status} />
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell font-mono text-xs text-muted-foreground">
                      {formatDuration(task.duration)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setLogTaskId(task.id)}
                        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      >
                        <ChevronLeft size={13} className="rotate-180" />
                      </button>
                    </td>
                  </tr>
                ))}
                {isLoadingTasks && Array.from({length: 5}).map((_, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td colSpan={6} className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-4 flex-1" />
                        <Skeleton className="h-5 w-16 rounded" />
                      </div>
                    </td>
                  </tr>
                ))}
                {!isLoadingTasks && tasks.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground">
                      {t('env.noTasks')}
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
                {t('agentTasks.previous')}
              </Button>
              <span className="text-xs font-mono text-muted-foreground">
                {t('agentTasks.page', { current: page, total: totalPages })}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="h-7 text-xs"
              >
                {t('agentTasks.next')}
              </Button>
            </div>
          )}
        </div>
      </div>

      <TaskLogModal taskId={logTaskId} onClose={() => setLogTaskId(null)} />
      <CreateTaskModal
        open={createTaskOpen}
        onClose={() => setCreateTaskOpen(false)}
        envId={envId}
        onCreated={() => {
          setCreateTaskOpen(false)
          refetch()
        }}
      />
    </div>
  )
}
