import React, { useState } from 'react'
import { X, Trash2, Loader2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { stubDeleteAgent } from '@/api/stubs'
import type { Agent } from '@/api/types'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

interface Props {
  agent: Agent | null
  open: boolean
  onClose: () => void
  onDeleted: () => void
}

export function DeleteAgentModal({ agent, open, onClose, onDeleted }: Props) {
  const { t } = useI18n()
  const [confirmName, setConfirmName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isValid = confirmName.trim() === agent?.name

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!agent || !isValid) return
    setError('')
    setLoading(true)
    try {
      await stubDeleteAgent(agent.id)
      onDeleted()
      handleClose()
    } catch (err: any) {
      setError(err.message ?? 'Failed to delete')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setConfirmName('')
    setError('')
    onClose()
  }

  if (!agent) return null

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-red-400">{t('agent.deleteAgent')}</DialogTitle>
          <DialogDescription>
            {t('agent.deleteAgentConfirm')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleDelete}>
          <div className="px-6 pb-2 space-y-3">
            <div className="rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2">
              <p className="text-xs font-mono text-red-400">
                {agent.name}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {agent.ip_address} · {agent.os}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>
                Type <span className="font-mono font-bold">{agent.name}</span> to confirm
              </Label>
              <Input
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={agent.name}
                autoFocus
                className={cn('', isValid && 'border-green-500/50')}
              />
            </div>

            {error && <p className="text-xs text-red-400 font-mono">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={handleClose}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              size="sm"
              variant="destructive"
              disabled={loading || !isValid}
            >
              {loading ? <Loader2 size={13} className="animate-spin" /> : <><Trash2 size={13} /> {t('agent.deleteAgent')}</>}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
