import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { stubGetHosts, stubCreateScheduleRule } from '@/api/stubs'
import { TASK_TEMPLATES } from '@/api/types'
import type { TaskTemplate } from '@/api/types'
import { cn } from '@/lib/utils'
import { useI18n } from '@/i18n'
import type { CreateCronPayload } from '@/api/platform'

const CRON_PRESETS = [
  { label: '*/5 * * * *', hint: 'Every 5 min' },
  { label: '*/15 * * * *', hint: 'Every 15 min' },
  { label: '0 * * * *', hint: 'Every hour' },
  { label: '0 0 * * *', hint: 'Daily midnight' },
  { label: '0 9 * * 1', hint: 'Mon 09:00' },
]

interface Props {
  open: boolean
  envId: string
  onClose: () => void
  onCreated: () => void
}

export function CreateCronRuleModal({ open, envId, onClose, onCreated }: Props) {
  const { t } = useI18n()
  const queryClient = useQueryClient()

  const [template, setTemplate] = useState<TaskTemplate>('system_info')
  const [cronExpr, setCronExpr] = useState('*/15 * * * *')
  const [target, setTarget] = useState('')
  const [command, setCommand] = useState('')
  const [selectedHostIds, setSelectedHostIds] = useState<string[]>([])
  const [isEnabled, setIsEnabled] = useState(true)
  const [error, setError] = useState('')

  const selectedTpl = TASK_TEMPLATES.find((tt) => tt.id === template)

  const { data: hosts = [] } = useQuery({
    queryKey: ['hosts-env', envId],
    queryFn: () => stubGetHosts(envId),
    enabled: open,
  })

  const mutation = useMutation({
    mutationFn: (payload: CreateCronPayload) => stubCreateScheduleRule(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cron-rules', envId] })
      handleClose()
      onCreated()
    },
    onError: () => setError(t('cron.createFailed')),
  })

  const handleClose = () => {
    setTemplate('system_info')
    setCronExpr('*/15 * * * *')
    setTarget('')
    setCommand('')
    setSelectedHostIds([])
    setIsEnabled(true)
    setError('')
    onClose()
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!cronExpr.trim()) { setError(t('cron.cronRequired')); return }
    if (selectedTpl?.requiresTarget && !target.trim()) return
    if (selectedTpl?.requiresCommand && !command.trim()) return

    mutation.mutate({
      environment_id: envId,
      template,
      cron_expr: cronExpr.trim(),
      host_ids: selectedHostIds.length > 0 ? selectedHostIds : undefined,
      is_enabled: isEnabled,
      command: selectedTpl?.requiresCommand ? command : undefined,
      target: selectedTpl?.requiresTarget ? target : undefined,
    })
  }

  const toggleHost = (id: string) => {
    setSelectedHostIds((prev) =>
      prev.includes(id) ? prev.filter((h) => h !== id) : [...prev, id],
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('cron.newCron')}</DialogTitle>
          <DialogDescription>{t('cron.newCronDescription')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="px-6 pb-2 space-y-4">
            {/* Task template */}
            <div className="space-y-1.5">
              <Label>{t('cron.taskTemplate')}</Label>
              <Select value={template} onValueChange={(v) => setTemplate(v as TaskTemplate)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_TEMPLATES.map((tt) => (
                    <SelectItem key={tt.id} value={tt.id}>
                      <span className="font-medium text-xs">{t(tt.labelKey)}</span>
                      <span className="ml-2 text-muted-foreground text-xs">{t(tt.descriptionKey)}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Target (ping only) */}
            {selectedTpl?.requiresTarget && (
              <div className="space-y-1.5">
                <Label>{t('env.taskTarget')}</Label>
                <Input
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder={t('env.taskTargetPlaceholder')}
                  className="font-mono text-xs"
                  autoFocus
                />
              </div>
            )}

            {/* Command (custom_command only) */}
            {selectedTpl?.requiresCommand && (
              <div className="space-y-1.5">
                <Label>{t('newTask.commandLabel')}</Label>
                <Textarea
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder={t('newTask.commandPlaceholder')}
                  className="font-mono text-xs min-h-20"
                  autoFocus
                />
              </div>
            )}

            {/* Cron expression */}
            <div className="space-y-1.5">
              <Label>{t('cron.cronExpr')}</Label>
              <Input
                value={cronExpr}
                onChange={(e) => setCronExpr(e.target.value)}
                placeholder="*/15 * * * *"
                className="font-mono text-xs"
              />
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {CRON_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setCronExpr(p.label)}
                    className={cn(
                      'px-2 py-0.5 rounded text-[10px] border transition-colors',
                      cronExpr === p.label
                        ? 'bg-accent border-border text-foreground'
                        : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent/50',
                    )}
                  >
                    {p.hint}
                  </button>
                ))}
              </div>
            </div>

            {/* Host filter (optional) */}
            {hosts.length > 0 && (
              <div className="space-y-1.5">
                <Label>
                  {t('cron.targetHosts')}
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    {t('cron.allHostsHint')}
                  </span>
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {hosts.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => toggleHost(h.id)}
                      className={cn(
                        'px-2.5 py-1 rounded-md text-[10px] font-mono border transition-colors',
                        selectedHostIds.includes(h.id)
                          ? 'bg-accent border-accent-foreground/20 text-foreground'
                          : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent/50',
                      )}
                    >
                      {h.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Enabled */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="cron-enabled"
                checked={isEnabled}
                onCheckedChange={(v) => setIsEnabled(v === true)}
              />
              <label htmlFor="cron-enabled" className="text-xs cursor-pointer select-none">
                {t('cron.enabled')}
              </label>
            </div>

            {error && <p className="text-xs text-destructive font-mono">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={handleClose}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={
                mutation.isPending ||
                !cronExpr.trim() ||
                (selectedTpl?.requiresTarget && !target.trim()) ||
                (selectedTpl?.requiresCommand && !command.trim())
              }
            >
              {mutation.isPending
                ? <Loader2 size={13} className="animate-spin" />
                : t('cron.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
