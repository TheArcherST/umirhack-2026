import React, { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface MemberOption {
  userId: string
  name: string
  email: string
}

interface MemberRoleEntry {
  userId: string
  role: string
}

interface Props {
  members: MemberOption[]
  value: MemberRoleEntry[]
  onChange: (entries: MemberRoleEntry[]) => void
  placeholder: string
  roleOptions: { value: string; label: string }[]
}

export function MultiMemberSelect({ members, value, onChange, placeholder, roleOptions }: Props) {
  const [open, setOpen] = useState(false)

  const toggle = (userId: string) => {
    const exists = value.find((v) => v.userId === userId)
    if (exists) {
      onChange(value.filter((v) => v.userId !== userId))
    } else {
      onChange([...value, { userId, role: roleOptions[0]?.value ?? '' }])
    }
  }

  const updateRole = (userId: string, role: string) => {
    onChange(value.map((v) => v.userId === userId ? { ...v, role } : v))
  }

  const selectedCount = value.length

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center justify-between w-full h-9 px-3 rounded-md border border-border bg-background text-sm hover:bg-accent/50 transition-colors"
        >
          <span className="truncate text-left">
            {selectedCount > 0
              ? `${selectedCount} selected`
              : placeholder
            }
          </span>
          <ChevronDown size={14} className="text-muted-foreground shrink-0 ml-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-1 min-w-[280px] max-h-56 overflow-y-auto" align="start" sideOffset={4}>
        <div className="space-y-0.5" onWheelCapture={(e) => e.stopPropagation()}>
          {members.map((member) => {
            const entry = value.find((v) => v.userId === member.userId)
            const checked = !!entry
            return (
              <div
                key={member.userId}
                className={cn(
                  'flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm transition-colors',
                  checked ? 'bg-accent/50' : 'hover:bg-accent/30',
                )}
              >
                <button
                  type="button"
                  onClick={() => toggle(member.userId)}
                  className="flex items-center gap-2 flex-1 min-w-0 text-left"
                >
                  <div className={cn(
                    'w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0',
                    checked ? 'border-foreground bg-foreground text-background' : 'border-border',
                  )}>
                    {checked && <Check size={10} />}
                  </div>
                  <div className="w-5 h-5 rounded-full bg-foreground/15 flex items-center justify-center text-[9px] font-semibold font-mono shrink-0">
                    {member.name[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs truncate">{member.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{member.email}</p>
                  </div>
                </button>
                {checked && (
                  <Select value={entry.role} onValueChange={(v) => updateRole(member.userId, v)}>
                    <SelectTrigger className="w-24 h-6 text-[10px]" onClick={(e) => e.stopPropagation()}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roleOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value} className="text-xs">
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
