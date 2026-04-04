import React, { useState, useEffect } from 'react'
import { Save, Loader2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MultiEnvSelect } from '@/components/ui/multi-env-select'
import { stubUpdateAgent } from '@/api/stubs'
import type { Agent } from '@/api/types'
import { useI18n } from '@/i18n'
import { useProject } from '@/hooks/useProject'

interface Props {
  agent: Agent | null
  open: boolean
  onClose: () => void
  onUpdated: () => void
}

export function EditAgentModal({ agent, open, onClose, onUpdated }: Props) {
  const { t } = useI18n()
  const { environments } = useProject()
  const [name, setName] = useState('')
  const [selectedEnvs, setSelectedEnvs] = useState<string[]>([])
  const [safeInstall, setSafeInstall] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (agent && open) {
      setName(agent.name)
      setSelectedEnvs([...agent.environment_ids])
      setSafeInstall(agent.safe_install)
    }
  }, [agent, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!agent || !name.trim() || selectedEnvs.length === 0) return
    setLoading(true)
    try {
      await stubUpdateAgent(agent.id, {
        name: name.trim(),
        safe_install: safeInstall,
        environment_ids: selectedEnvs,
      })
      onUpdated()
      handleClose()
    } catch { /* handled by parent */ }
    finally { setLoading(false) }
  }

  const handleClose = () => {
    setName('')
    setSelectedEnvs([])
    setSafeInstall(false)
    onClose()
  }

  if (!agent) return null

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('agent.editAgent')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="px-6 pb-2 space-y-4">
            <div className="space-y-1.5">
              <Label>{t('agent.agentName')}</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('agent.agentNamePlaceholder')}
                autoFocus
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label>{t('agent.environments')}</Label>
              <MultiEnvSelect
                environments={environments}
                value={selectedEnvs}
                onChange={setSelectedEnvs}
                placeholder={t('agent.selectEnvPlaceholder')}
              />
            </div>

            <label className="flex items-start gap-3 rounded-md border border-border px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={safeInstall}
                onChange={(e) => setSafeInstall(e.target.checked)}
                className="mt-0.5"
              />
              <span className="space-y-1">
                <span className="block font-medium">{t('agent.safeInstall')}</span>
                <span className="block text-xs text-muted-foreground">{t('agent.safeInstallHint')}</span>
              </span>
            </label>
          </div>

          <div className="flex justify-end gap-2 px-6 pb-2">
            <Button type="button" variant="ghost" size="sm" onClick={handleClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" size="sm" disabled={loading || !name.trim() || selectedEnvs.length === 0}>
              {loading ? <Loader2 size={13} className="animate-spin" /> : <><Save size={13} /> {t('common.saveChanges')}</>}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
