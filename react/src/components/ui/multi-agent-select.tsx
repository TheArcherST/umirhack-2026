import React, { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface AgentOption {
  id: string
  name: string
  status: string
}

interface Props {
  agents: AgentOption[]
  value: string[]
  onChange: (ids: string[]) => void
  placeholder: string
}

export function MultiAgentSelect({ agents, value, onChange, placeholder }: Props) {
  const [open, setOpen] = useState(false)

  const toggle = (agentId: string) => {
    onChange(value.includes(agentId) ? value.filter((id) => id !== agentId) : [...value, agentId])
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center justify-between w-full h-9 px-3 rounded-md border border-border bg-background text-sm hover:bg-accent/50 transition-colors"
        >
          <span className="truncate text-left">
            {value.length > 0
              ? value.map((id) => agents.find((a) => a.id === id)?.name).filter(Boolean).join(', ')
              : placeholder
            }
          </span>
          <ChevronDown size={14} className="text-muted-foreground shrink-0 ml-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-1 min-w-[200px] max-h-48 overflow-y-auto" align="start" sideOffset={4}>
        <div onWheelCapture={(e) => e.stopPropagation()}>
          {agents.map((agent) => {
          const checked = value.includes(agent.id)
          return (
            <button
              key={agent.id}
              type="button"
              onClick={() => toggle(agent.id)}
              className={cn(
                'flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm transition-colors',
                checked ? 'bg-accent text-foreground' : 'hover:bg-accent/50 text-muted-foreground',
              )}
            >
              <div className={cn(
                'w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0',
                checked ? 'border-foreground bg-foreground text-background' : 'border-border',
              )}>
                {checked && <Check size={10} />}
              </div>
              <span className="truncate">{agent.name}</span>
              <span className={cn(
                'w-1.5 h-1.5 rounded-full ml-auto shrink-0',
                agent.status === 'online' ? 'bg-green-400' : 'bg-muted-foreground/40',
              )} />
            </button>
          )
        })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
