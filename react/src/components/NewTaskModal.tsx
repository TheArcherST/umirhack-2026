import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { stubGetAgents, stubCreateTaskV2 } from '@/api/stubs'
import { TASK_TEMPLATES } from '@/api/types'
import type { TaskTemplate } from '@/api/types'
import { useI18n } from '@/i18n'
import { EndpointTargetInput } from '@/components/EndpointTargetInput'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
  defaultAgentId?: string
}

export function NewTaskModal({ open, onClose, onCreated, defaultAgentId }: Props) {
  const [agentId, setAgentId] = useState(defaultAgentId ?? '')
  const [template, setTemplate] = useState<TaskTemplate>('custom_command')
  const [target, setTarget] = useState('')
  const [command, setCommand] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { t } = useI18n()

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => stubGetAgents(),
    enabled: open,
  })

  const selectedTemplate = TASK_TEMPLATES.find((item) => item.id === template)
  const selectedAgent = agents.find((agent) => agent.id === agentId)
  const suggestionEnvId = selectedAgent?.environment_ids.length === 1
    ? selectedAgent.environment_ids[0]
    : undefined

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!agentId) return
    if (selectedTemplate?.requiresTarget && !target.trim()) return
    if (selectedTemplate?.requiresCommand && !command.trim()) return
    setError('')
    setLoading(true)
    try {
      await stubCreateTaskV2({
        agent_id: agentId,
        template,
        target: selectedTemplate?.requiresTarget ? target.trim() : undefined,
        command: selectedTemplate?.requiresCommand ? command.trim() : undefined,
      })
      setTarget('')
      setCommand('')
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
      setTemplate('custom_command')
      setTarget('')
      setCommand('')
      setError('')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('newTask.title')}</DialogTitle>
          <DialogDescription>{t('newTask.description')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="px-6 pb-2 space-y-4">
            <div className="space-y-1.5">
              <Label>{t('newTask.agentLabel')}</Label>
              <Select value={agentId} onValueChange={setAgentId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('newTask.agentPlaceholder')} />
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

            <div className="space-y-1.5">
              <Label>{t('env.selectTask')}</Label>
              <Select value={template} onValueChange={(value) => setTemplate(value as TaskTemplate)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_TEMPLATES.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      <div>
                        <span className="font-medium text-xs">{t(item.labelKey)}</span>
                        <span className="ml-2 text-muted-foreground text-xs">{t(item.descriptionKey)}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedTemplate?.requiresTarget && (
              <div className="space-y-1.5">
                <Label>{t('env.taskTarget')}</Label>
                <EndpointTargetInput
                  environmentId={suggestionEnvId}
                  placeholder={t('env.taskTargetPlaceholder')}
                  value={target}
                  onChange={setTarget}
                  autoFocus
                />
              </div>
            )}

            {selectedTemplate?.requiresCommand && (
              <div className="space-y-1.5">
                <Label>{t('newTask.commandLabel')}</Label>
                <Textarea
                  placeholder={t('newTask.commandPlaceholder')}
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  className="font-mono text-xs min-h-24"
                  autoFocus
                />
              </div>
            )}

            {selectedTemplate?.requiresCommand && selectedAgent?.safe_install && (
              <p className="text-xs text-amber-500 font-mono">{t('newTask.safeModeHint')}</p>
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
              disabled={
                loading ||
                !agentId ||
                (selectedTemplate?.requiresTarget && !target.trim()) ||
                (selectedTemplate?.requiresCommand && !command.trim())
              }
            >
              {loading ? <Loader2 size={13} className="animate-spin" /> : t('newTask.runTask')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
