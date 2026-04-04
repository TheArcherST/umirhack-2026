import type { AgentStatus } from '@/api/types'

export function agentStatusTone(status: AgentStatus): string {
  if (status === 'online') return 'bg-green-400 status-pulse'
  if (status === 'stale') return 'bg-amber-400'
  return 'bg-muted-foreground/40'
}

export function agentStatusTextTone(status: AgentStatus): string {
  if (status === 'online') return 'text-green-400'
  if (status === 'stale') return 'text-amber-400'
  return 'text-muted-foreground'
}

export function agentStatusLabelKey(status: AgentStatus): 'common.online' | 'common.stale' | 'common.offline' {
  if (status === 'online') return 'common.online'
  if (status === 'stale') return 'common.stale'
  return 'common.offline'
}
