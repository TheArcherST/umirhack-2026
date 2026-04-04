import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Network } from 'lucide-react'
import { stubGetEnvironmentEndpointSuggestions } from '@/api/stubs'
import { Input, type InputProps } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useI18n } from '@/i18n'
import type { EndpointSuggestion } from '@/api/types'
import { cn } from '@/lib/utils'

interface Props extends Omit<InputProps, 'value' | 'onChange'> {
  environmentId?: string
  value: string
  onChange: (value: string) => void
}

const MAX_VISIBLE_SUGGESTIONS = 8

function matchesSuggestion(suggestion: EndpointSuggestion, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return true
  return [
    suggestion.value,
    suggestion.label,
    suggestion.source,
  ].some((value) => value.toLowerCase().includes(normalizedQuery))
}

export function EndpointTargetInput({
  environmentId,
  value,
  onChange,
  className,
  onFocus,
  onBlur,
  ...props
}: Props) {
  const { t } = useI18n()
  const [focused, setFocused] = useState(false)
  const deferredValue = React.useDeferredValue(value)
  const { data: suggestions = [], isLoading } = useQuery({
    queryKey: ['environment-endpoint-suggestions', environmentId],
    queryFn: () => stubGetEnvironmentEndpointSuggestions(environmentId!),
    enabled: Boolean(environmentId),
    staleTime: 30_000,
  })

  const filteredSuggestions = useMemo(
    () => suggestions
      .filter((suggestion) => matchesSuggestion(suggestion, deferredValue))
      .slice(0, MAX_VISIBLE_SUGGESTIONS),
    [deferredValue, suggestions],
  )

  const popoverOpen = Boolean(environmentId) && focused && (isLoading || filteredSuggestions.length > 0)

  return (
    <div className="space-y-1.5">
      <Popover open={popoverOpen} onOpenChange={setFocused}>
        <PopoverTrigger asChild>
          <div>
            <Input
              {...props}
              value={value}
              onChange={(event) => {
                onChange(event.target.value)
                setFocused(true)
              }}
              onFocus={(event) => {
                setFocused(true)
                onFocus?.(event)
              }}
              onBlur={(event) => {
                onBlur?.(event)
              }}
              className={cn('font-mono text-xs', className)}
              autoComplete="off"
            />
          </div>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] p-1"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          {isLoading ? (
            <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
              <Loader2 size={12} className="animate-spin" />
              {t('env.taskTargetSuggestionsLoading')}
            </div>
          ) : (
            <div className="max-h-56 overflow-y-auto">
              {filteredSuggestions.map((suggestion) => (
                <button
                  key={`${suggestion.kind}:${suggestion.value}`}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(suggestion.value)
                    setFocused(false)
                  }}
                  className="flex w-full items-start gap-2 rounded px-2 py-2 text-left hover:bg-accent/60"
                >
                  <Network size={12} className="mt-0.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-xs text-foreground">
                      {suggestion.label}
                    </span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {suggestion.source}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>
      {environmentId && (
        <p className="text-[11px] text-muted-foreground">
          {t('env.taskTargetSuggestionsHint')}
        </p>
      )}
    </div>
  )
}
