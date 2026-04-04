import React, { useState, useEffect } from 'react'
import { Loader2, CheckCircle2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MultiAgentSelect } from '@/components/ui/multi-agent-select'
import { MultiMemberSelect } from '@/components/ui/multi-member-select'
import { stubCreateEnvironment, stubGetProjectMembers, stubGetAgents, stubAssignEnvRole } from '@/api/stubs'
import type { MemberRole, Agent } from '@/api/types'
import { useI18n } from '@/i18n'
import { useProject } from '@/hooks/useProject'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

export function CreateEnvironmentModal({ open, onClose, onCreated }: Props) {
  const { t } = useI18n()
  const { currentProject, selectEnvironment } = useProject()
  const [name, setName] = useState('')
  const [selectedAgents, setSelectedAgents] = useState<string[]>([])
  const [selectedMembers, setSelectedMembers] = useState<{ userId: string; role: string }[]>([])
  const [memberOptions, setMemberOptions] = useState<{ userId: string; name: string; email: string }[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  // Reset state when modal opens/closes
  useEffect(() => {
    if (open) {
      setName('')
      setSelectedAgents([])
      setSelectedMembers([])
      setError('')
      setSuccess(false)
      if (currentProject?.id) {
        stubGetProjectMembers(currentProject.id).then((m) => {
          setMemberOptions(
            m.filter((x) => x.role !== 'owner').map((x) => ({
              userId: x.user_id, name: x.name, email: x.email,
            })),
          )
        })
        stubGetAgents().then(setAgents)
      }
    }
  }, [open, currentProject])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !currentProject) return
    setError('')
    setLoading(true)
    try {
      const env = await stubCreateEnvironment({ name: name.trim(), project_id: currentProject.id })

      for (const m of selectedMembers) {
        await stubAssignEnvRole({ user_id: m.userId, env_id: env.id, role: m.role as MemberRole })
      }

      setSuccess(true)
      selectEnvironment(env.id)
      onCreated()
    } catch (err: any) {
      setError(err.message ?? 'Failed to create environment')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    onClose()
  }

  const agentOptions = agents.map((a) => ({ id: a.id, name: a.name, status: a.status }))

  const roleOptions = [
    { value: 'operator', label: t('member.roleOperator') },
    { value: 'observer', label: t('member.roleObserver') },
  ]

  // Only close dialog when user explicitly clicks close
  const handleOpenChange = (open: boolean) => {
    if (!open && success) {
      handleClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md" onInteractOutside={(e) => {
        // Prevent closing when clicking outside during success state
        if (success || loading) e.preventDefault()
      }}>
        <DialogHeader>
          <DialogTitle>{t('project.createEnvironment')}</DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="px-6 pb-4 space-y-3">
            <div className="flex items-center gap-2 text-green-400">
              <CheckCircle2 size={16} />
              <p className="text-sm font-medium">{t('project.createEnvironment')} — OK</p>
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={handleClose}>{t('common.close')}</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="px-6 pb-2 space-y-4">
              <div className="space-y-1.5">
                <Label>{t('project.environmentName')}</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('project.environmentNamePlaceholder')}
                  autoFocus
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label>{t('agent.addAgent')}</Label>
                <MultiAgentSelect
                  agents={agentOptions}
                  value={selectedAgents}
                  onChange={setSelectedAgents}
                  placeholder={t('agent.selectAgent')}
                />
              </div>

              {memberOptions.length > 0 && (
                <div className="space-y-1.5">
                  <Label>{t('member.roleAssignment')}</Label>
                  <MultiMemberSelect
                    members={memberOptions}
                    value={selectedMembers}
                    onChange={setSelectedMembers}
                    placeholder={t('member.selectMember')}
                    roleOptions={roleOptions}
                  />
                </div>
              )}

              {error && <p className="text-xs text-red-400 font-mono">{error}</p>}
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" size="sm" onClick={handleClose} disabled={loading}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" size="sm" disabled={loading || !name.trim()}>
                {loading ? <Loader2 size={13} className="animate-spin" /> : t('project.createEnvironment')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
