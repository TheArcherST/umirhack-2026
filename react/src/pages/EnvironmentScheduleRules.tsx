import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { Plus, Clock, Pencil, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  stubGetScheduleRules,
  stubGetEnvironments,
  stubPatchScheduleRule,
  stubDeleteScheduleRule,
  kindToTemplate,
  stubGetHosts,
} from '@/api/stubs'
import { TASK_TEMPLATES } from '@/api/types'
import { CreateCronRuleModal } from '@/components/CreateCronRuleModal'
import { EndpointTargetInput } from '@/components/EndpointTargetInput'
import { formatDate } from '@/lib/utils'
import { useI18n } from '@/i18n'
import type { ScheduleRule } from '@/api/types'
import { Textarea } from '@/components/ui/textarea'

const CRON_PRESETS = [
  { label: '*/5 * * * *', hint: 'Every 5 min' },
  { label: '*/15 * * * *', hint: 'Every 15 min' },
  { label: '0 * * * *', hint: 'Every hour' },
  { label: '0 0 * * *', hint: 'Daily midnight' },
  { label: '0 9 * * 1', hint: 'Mon 09:00' },
]

function EditCronModal({
  rule,
  onClose,
  onSaved,
}: {
  rule: ScheduleRule
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [cronExpr, setCronExpr] = useState(rule.cron_expr)
  const [isEnabled, setIsEnabled] = useState(rule.is_enabled)
  const [target, setTarget] = useState(String(rule.target_selector_json.target_endpoint ?? ''))
  const [command, setCommand] = useState(String(rule.target_selector_json.approved_command ?? ''))
  const [selectedHostIds, setSelectedHostIds] = useState<string[]>(
    Array.isArray(rule.target_selector_json.host_ids)
      ? rule.target_selector_json.host_ids.filter((value): value is string => typeof value === 'string')
      : [],
  )
  const selectedTemplate = TASK_TEMPLATES.find((tt) => tt.id === kindToTemplate(rule.task_kind))
  const { data: hosts = [] } = useQuery({
    queryKey: ['hosts-env', rule.environment_id],
    queryFn: () => stubGetHosts(rule.environment_id),
  })

  const mutation = useMutation({
    mutationFn: () =>
      stubPatchScheduleRule(rule.id, {
        cron_expr: cronExpr.trim() !== rule.cron_expr ? cronExpr.trim() : undefined,
        is_enabled: isEnabled !== rule.is_enabled ? isEnabled : undefined,
        host_ids: selectedHostIds,
        approved_command: command.trim() || null,
        target_endpoint: target.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cron-rules', rule.environment_id] })
      onSaved()
      onClose()
    },
  })

  const toggleHost = (id: string) => {
    setSelectedHostIds((prev) =>
      prev.includes(id) ? prev.filter((hostId) => hostId !== id) : [...prev, id],
    )
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('cron.editCron')}</DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-2 space-y-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('cron.task')}</p>
            <p className="text-xs font-medium">
              {selectedTemplate ? t(selectedTemplate.labelKey) : rule.task_name}
            </p>
          </div>
          {selectedTemplate?.requiresTarget && (
            <div className="space-y-1.5">
              <Label>{t('env.taskTarget')}</Label>
              <EndpointTargetInput
                environmentId={rule.environment_id}
                value={target}
                onChange={setTarget}
                placeholder={t('env.taskTargetPlaceholder')}
              />
            </div>
          )}
          {selectedTemplate?.requiresCommand && (
            <div className="space-y-1.5">
              <Label>{t('newTask.commandLabel')}</Label>
              <Textarea
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder={t('newTask.commandPlaceholder')}
                className="font-mono text-xs min-h-20"
              />
            </div>
          )}
          {hosts.length > 0 && (
            <div className="space-y-1.5">
              <Label>
                {t('cron.targetHosts')}
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  {t('cron.allHostsHint')}
                </span>
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {hosts.map((host) => (
                  <button
                    key={host.id}
                    type="button"
                    onClick={() => toggleHost(host.id)}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-mono border transition-colors ${
                      selectedHostIds.includes(host.id)
                        ? 'bg-accent border-accent-foreground/20 text-foreground'
                        : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent/50'
                    }`}
                  >
                    {host.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{t('cron.cronExpr')}</Label>
            <Input
              value={cronExpr}
              onChange={(e) => setCronExpr(e.target.value)}
              className="font-mono text-xs"
            />
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {CRON_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setCronExpr(p.label)}
                  className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                    cronExpr === p.label
                      ? 'bg-accent border-border text-foreground'
                      : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  }`}
                >
                  {p.hint}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="edit-cron-enabled"
              checked={isEnabled}
              onCheckedChange={(v) => setIsEnabled(v === true)}
            />
            <label htmlFor="edit-cron-enabled" className="text-xs cursor-pointer select-none">
              {t('cron.enabled')}
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            size="sm"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !cronExpr.trim()}
          >
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function EnvironmentScheduleRules() {
  const { envId } = useParams<{ envId: string }>()
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [editRule, setEditRule] = useState<ScheduleRule | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data: envs } = useQuery({
    queryKey: ['environments'],
    queryFn: () => stubGetEnvironments(''),
  })
  const { data: hosts = [] } = useQuery({
    queryKey: ['hosts-env', envId],
    queryFn: () => stubGetHosts(envId!),
    enabled: !!envId,
  })
  const hostNameById = new Map(hosts.map((host) => [host.id, host.name]))
  const currentEnv = envs?.find((e) => e.id === envId)

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['cron-rules', envId],
    queryFn: () => stubGetScheduleRules(envId!),
    refetchInterval: 30_000,
    enabled: !!envId,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => stubDeleteScheduleRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cron-rules', envId] })
      setDeleteId(null)
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_enabled }: { id: string; is_enabled: boolean }) =>
      stubPatchScheduleRule(id, { is_enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cron-rules', envId] }),
  })

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header
        className="flex items-center justify-between px-5 border-b border-border bg-card/50 backdrop-blur-sm"
        style={{ height: 'var(--header-height)' }}
      >
        <h1 className="text-sm font-semibold text-foreground">
          {currentEnv?.name ?? 'Environment'} — {t('cron.title')}
        </h1>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus size={13} className="mr-1.5" />
          {t('cron.new')}
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="p-5">
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('cron.task')}</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden lg:table-cell">{t('cron.details')}</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('cron.cronExpr')}</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">{t('cron.nextRun')}</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('common.status')}</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell">{t('cron.created')}</th>
                  <th className="px-4 py-2.5 w-20" />
                </tr>
              </thead>
              <tbody>
                {isLoading && Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                    <td className="px-4 py-3 hidden lg:table-cell"><Skeleton className="h-4 w-28" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-4 py-3 hidden md:table-cell"><Skeleton className="h-4 w-28" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-16 rounded-full" /></td>
                    <td className="px-4 py-3 hidden sm:table-cell"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-4 py-3" />
                  </tr>
                ))}
                {!isLoading && rules.map((rule) => (
                  <tr key={rule.id} className="border-b border-border/50 last:border-0 hover:bg-accent/20 transition-colors">
                    <td className="px-4 py-3">
                      {(() => {
                        const tpl = TASK_TEMPLATES.find((t) => t.id === kindToTemplate(rule.task_kind))
                        return (
                          <>
                            <p className="text-xs font-medium">{tpl ? t(tpl.labelKey) : rule.task_name}</p>
                            <p className="text-[10px] text-muted-foreground">{tpl ? t(tpl.descriptionKey) : rule.task_kind}</p>
                          </>
                        )
                      })()}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {rule.target_selector_json.target_endpoint && (
                        <code className="text-xs font-mono text-muted-foreground">
                          {rule.target_selector_json.target_endpoint}
                        </code>
                      )}
                      {rule.target_selector_json.approved_command && (
                        <code className="text-xs font-mono text-muted-foreground truncate max-w-[160px] block">
                          {rule.target_selector_json.approved_command}
                        </code>
                      )}
                      {Array.isArray(rule.target_selector_json.host_ids) && rule.target_selector_json.host_ids.length > 0 && (
                        <p className="text-[10px] text-muted-foreground">
                          {rule.target_selector_json.host_ids
                            .map((hostId) => hostNameById.get(String(hostId)) ?? String(hostId))
                            .join(', ')}
                        </p>
                      )}
                      {!rule.target_selector_json.target_endpoint
                        && !rule.target_selector_json.approved_command
                        && (!Array.isArray(rule.target_selector_json.host_ids) || rule.target_selector_json.host_ids.length === 0) && (
                        <span className="text-xs text-muted-foreground/40">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Clock size={11} className="text-muted-foreground shrink-0" />
                        <code className="text-xs font-mono">{rule.cron_expr}</code>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell font-mono text-xs text-muted-foreground">
                      {rule.next_run_at ? formatDate(rule.next_run_at) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleMutation.mutate({ id: rule.id, is_enabled: !rule.is_enabled })}
                        disabled={toggleMutation.isPending}
                        className="focus:outline-none"
                      >
                        <Badge
                          variant={rule.is_enabled ? 'success' : 'muted'}
                          className="cursor-pointer hover:opacity-80 transition-opacity"
                        >
                          {rule.is_enabled ? t('cron.enabled') : t('cron.disabled')}
                        </Badge>
                      </button>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell font-mono text-xs text-muted-foreground">
                      {formatDate(rule.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setEditRule(rule)}
                          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => setDeleteId(rule.id)}
                          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-accent transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!isLoading && rules.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground">
                      {t('cron.noRules')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <CreateCronRuleModal
        open={createOpen}
        envId={envId!}
        onClose={() => setCreateOpen(false)}
        onCreated={() => setCreateOpen(false)}
      />

      {editRule && (
        <EditCronModal
          rule={editRule}
          onClose={() => setEditRule(null)}
          onSaved={() => setEditRule(null)}
        />
      )}

      {/* Delete confirm */}
      <Dialog open={!!deleteId} onOpenChange={(v) => { if (!v) setDeleteId(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('cron.deleteConfirmTitle')}</DialogTitle>
          </DialogHeader>
          <p className="px-6 text-xs text-muted-foreground">{t('cron.deleteConfirmBody')}</p>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDeleteId(null)}>{t('common.cancel')}</Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
            >
              {t('cron.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
