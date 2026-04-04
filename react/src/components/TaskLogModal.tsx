import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Copy, CheckCircle2, XCircle, Clock, Terminal } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { stubGetTask } from '@/api/stubs'
import { formatDate, formatDuration } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { useI18n } from '@/i18n'

interface Props {
  taskId: string | null
  onClose: () => void
}

function CopyButton({ text }: { text: string }) {
  const { t } = useI18n()
  const [copied, setCopied] = React.useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      title={t('common.copy')}
    >
      {copied ? <CheckCircle2 size={13} className="text-green-400" /> : <Copy size={13} />}
    </button>
  )
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground w-28 shrink-0">{label}</span>
      <span className="text-xs font-mono">{value}</span>
    </div>
  )
}

export function TaskLogModal({ taskId, onClose }: Props) {
  const { t } = useI18n()
  const { data: task, isLoading } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => stubGetTask(taskId!),
    enabled: !!taskId,
  })

  const statusIcon = task?.status === 'success'
    ? <CheckCircle2 size={13} className="text-green-400" />
    : task?.status === 'failed' || task?.status === 'timeout'
    ? <XCircle size={13} className="text-red-400" />
    : <Clock size={13} className="text-muted-foreground" />

  return (
    <Dialog open={!!taskId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Terminal size={14} className="text-muted-foreground" />
            <DialogTitle>{t('taskLog.title')}</DialogTitle>
          </div>
          {task && (
            <DialogDescription className="font-mono text-xs truncate">
              {task.command}
            </DialogDescription>
          )}
        </DialogHeader>

        {isLoading && (
          <div className="px-6 pb-6 space-y-4">
            <div className="rounded-md border border-border bg-muted/20 px-4 py-3 space-y-2">
              {Array.from({length: 5}).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </div>
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-32 w-full rounded-md" />
          </div>
        )}

        {task && (
          <div className="px-6 pb-6 space-y-4">
            {/* Meta */}
            <div className="rounded-md border border-border bg-muted/20 px-4">
              <MetaRow label={t('common.status')} value={
                <div className="flex items-center gap-1.5">
                  {statusIcon}
                  <span>{task.status}</span>
                </div>
              } />
              <MetaRow label={t('taskLog.exitCode')} value={task.result ? String(task.result.exit_code) : '—'} />
              <MetaRow label={t('common.duration')} value={formatDuration(task.duration)} />
              {task.started_at && <MetaRow label={t('taskLog.startedAt')} value={formatDate(task.started_at)} />}
              {task.completed_at && <MetaRow label={t('taskLog.completedAt')} value={formatDate(task.completed_at)} />}
              <MetaRow label={t('common.agent')} value={task.agent_name} />
            </div>

            {/* Output tabs */}
            {task.result && (
              <Tabs defaultValue="stdout">
                <TabsList>
                  <TabsTrigger value="stdout">{t('taskLog.stdout')}</TabsTrigger>
                  <TabsTrigger value="stderr" className={task.result.stderr ? 'text-red-400' : ''}>
                    {t('taskLog.stderr')} {task.result.stderr ? '•' : ''}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="stdout">
                  <div className="relative rounded-md border border-border bg-muted/30 overflow-hidden">
                    <div className="absolute top-2 right-2 z-10">
                      <CopyButton text={task.result.stdout} />
                    </div>
                    <pre
                      data-selectable
                      className="p-4 text-xs font-mono leading-relaxed overflow-x-auto max-h-64 overflow-y-auto text-foreground/80 whitespace-pre-wrap break-all"
                    >
                      {task.result.stdout || <span className="text-muted-foreground italic">{t('taskLog.noOutput')}</span>}
                    </pre>
                  </div>
                </TabsContent>

                <TabsContent value="stderr">
                  <div className="relative rounded-md border border-red-500/20 bg-red-500/5 overflow-hidden">
                    <div className="absolute top-2 right-2 z-10">
                      <CopyButton text={task.result.stderr} />
                    </div>
                    <pre
                      data-selectable
                      className="p-4 text-xs font-mono leading-relaxed overflow-x-auto max-h-64 overflow-y-auto text-red-300/80 whitespace-pre-wrap break-all"
                    >
                      {task.result.stderr || <span className="text-muted-foreground italic">{t('taskLog.noErrors')}</span>}
                    </pre>
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
