import React, { useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { stubDeleteHost } from '@/api/stubs'
import type { Host } from '@/api/types'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

interface Props {
  host: Host | null
  open: boolean
  onClose: () => void
  onDeleted: () => void
}

export function DeleteHostModal({ host, open, onClose, onDeleted }: Props) {
  const { t } = useI18n()
  const [confirmName, setConfirmName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isValid = confirmName.trim() === host?.name

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!host || !isValid) return
    setError('')
    setLoading(true)
    try {
      await stubDeleteHost(host.id)
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

  if (!host) return null

  return (
    <Dialog open={open} onOpenChange={(value) => !value && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-red-400">{t('env.deleteHost')}</DialogTitle>
          <DialogDescription>{t('env.deleteHostConfirm')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleDelete}>
          <div className="px-6 pb-2 space-y-3">
            <div className="rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2">
              <p className="text-xs font-mono text-red-400">{host.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {host.primary_ipv4 ?? host.primary_ipv6 ?? '—'} · {host.os_name ?? 'unknown'}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>
                {t('env.typeHostNameToConfirm', { name: host.name })}
              </Label>
              <Input
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={host.name}
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
              {loading ? <Loader2 size={13} className="animate-spin" /> : <><Trash2 size={13} /> {t('env.deleteHost')}</>}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
