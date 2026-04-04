import React, { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Environment } from '@/api/types'

interface Props {
  environments: Environment[]
  value: string[]
  onChange: (ids: string[]) => void
  placeholder: string
}

export function MultiEnvSelect({ environments, value, onChange, placeholder }: Props) {
  const [open, setOpen] = useState(false)

  const toggle = (envId: string) => {
    onChange(value.includes(envId) ? value.filter((id) => id !== envId) : [...value, envId])
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
              ? value.map((id) => environments.find((e) => e.id === id)?.name).filter(Boolean).join(', ')
              : placeholder
            }
          </span>
          <ChevronDown size={14} className="text-muted-foreground shrink-0 ml-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-1 min-w-[200px] max-h-48 overflow-y-auto" align="start" sideOffset={4}>
        <div onWheelCapture={(e) => e.stopPropagation()}>
          {environments.map((env) => {
          const checked = value.includes(env.id)
          return (
            <button
              key={env.id}
              type="button"
              onClick={() => toggle(env.id)}
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
              <span className="truncate">{env.name}</span>
            </button>
          )
        })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
