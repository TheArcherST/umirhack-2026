import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { stubGetAgents, stubCreateTask } from '@/api/stubs'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
  defaultAgentId?: string
}

export function NewTaskModal({ open, onClose, onCreated, defaultAgentId }: Props) {
  const [agentId, setAgentId] = useState(defaultAgentId ?? '')
  const [command, setCommand] = useState('')
  const [timeout, setTimeout_] = useState('30')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => stubGetAgents(),
    enabled: open,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!agentId || !command.trim()) return
    setError('')
    setLoading(true)
    try {
      await stubCreateTask({
        agent_id: agentId,
        command: command.trim(),
        timeout: parseInt(timeout, 10) || 30,
      })
      setCommand('')
      onCreated()
    } catch (err: any) {
      setError(err.message ?? 'Failed to create task')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose()
      setCommand('')
      setError('')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>Execute a command on a remote agent</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="px-6 pb-2 space-y-4">
            <div className="space-y-1.5">
              <Label>Agent</Label>
              <Select value={agentId} onValueChange={setAgentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select agent…" />
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
              <Label>Command</Label>
              <Textarea
                placeholder="df -h"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                className="h-24 font-mono text-xs"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label>Timeout (seconds)</Label>
              <Input
                type="number"
                min="1"
                max="300"
                value={timeout}
                onChange={(e) => setTimeout_(e.target.value)}
                className="w-24 font-mono text-xs"
              />
            </div>

            {error && <p className="text-xs text-red-400 font-mono">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={loading || !agentId || !command.trim()}
            >
              {loading ? <Loader2 size={13} className="animate-spin" /> : 'Run task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
