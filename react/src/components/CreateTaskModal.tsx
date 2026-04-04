import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { stubGetAgents, stubCreateTaskV2 } from '@/api/stubs'
import { TASK_TEMPLATES } from '@/api/types'
import type { TaskTemplate } from '@/api/types'
import { useI18n } from '@/i18n'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
  envId?: string
}

export function CreateTaskModal({ open, onClose, onCreated, envId }: Props) {
  const [agentId, setAgentId] = useState('')
  const [template, setTemplate] = useState<TaskTemplate>('system_info')
  const [target, setTarget] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { t } = useI18n()

  const { data: agents = [] } = useQuery({
    queryKey: ['agents-create-task', envId],
    queryFn: () => stubGetAgents(envId ? { environment_id: envId } : undefined),
    enabled: open,
  })

  const selectedTemplate = TASK_TEMPLATES.find((tt) => tt.id === template)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!agentId) return
    if (selectedTemplate?.requiresTarget && !target.trim()) return

    setError('')
    setLoading(true)
    try {
      await stubCreateTaskV2({
        agent_id: agentId,
        template,
        target: selectedTemplate?.requiresTarget ? target.trim() : undefined,
      })
      setTarget('')
      onCreated()
    } catch (err: any) {
      setError(err.message ?? t('newTask.createFailed'))
    } finally {
      setLoading(false)
    }
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose()
      setTarget('')
      setError('')
    }
  }

  const handleTemplateChange = (val: string) => {
    setTemplate(val as TaskTemplate)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('env.createTask')}</DialogTitle>
          <DialogDescription>{t('newTask.description')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="px-6 pb-2 space-y-4">
            {/* Agent select */}
            <div className="space-y-1.5">
              <Label>{t('env.selectAgent')}</Label>
              <Select value={agentId} onValueChange={setAgentId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('agent.selectAgent')} />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      <span className="font-mono text-xs">{a.name}</span>
                      <span className="ml-2 text-muted-foreground text-xs">{a.ip_address}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Task template */}
            <div className="space-y-1.5">
              <Label>{t('env.selectTask')}</Label>
              <Select value={template} onValueChange={handleTemplateChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_TEMPLATES.map((tt) => (
                    <SelectItem key={tt.id} value={tt.id}>
                      <div>
                        <span className="font-medium text-xs">{tt.label}</span>
                        <span className="ml-2 text-muted-foreground text-xs">{tt.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Target (only for ping) */}
            {selectedTemplate?.requiresTarget && (
              <div className="space-y-1.5">
                <Label>{t('env.taskTarget')}</Label>
                <Input
                  placeholder={t('env.taskTargetPlaceholder')}
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  className="font-mono text-xs"
                  autoFocus
                />
              </div>
            )}

            {error && <p className="text-xs text-red-400 font-mono">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={loading || !agentId || (selectedTemplate?.requiresTarget && !target.trim())}
            >
              {loading ? <Loader2 size={13} className="animate-spin" /> : t('newTask.runTask')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
