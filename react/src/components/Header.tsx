import { Sun, Moon } from 'lucide-react'
import { API_BASE_URL } from '@/api/client'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import React from 'react'

interface HeaderProps {
  title?: string
  right?: React.ReactNode
  backButton?: React.ReactNode
}

// Simple backend connection health check — tries to ping /api/health
function useBackendStatus() {
  const [connected, setConnected] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    const check = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/health`, { signal: AbortSignal.timeout(2000) })
        if (!cancelled) setConnected(res.ok)
      } catch {
        if (!cancelled) setConnected(false)
      }
    }
    check()
    const id = setInterval(check, 10_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  return connected
}

export function Header({ title, right, backButton }: HeaderProps) {
  const { theme, toggle } = useTheme()
  const { t } = useI18n()
  const connected = useBackendStatus()

  return (
    <header
      className="flex items-center justify-between px-5 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10"
      style={{ height: 'var(--header-height)' }}
    >
      <div className="flex items-center gap-2">
        {backButton}
        {title && (
          <h1 className="text-sm font-semibold text-foreground">{title}</h1>
        )}
      </div>

      <div className="flex items-center gap-3">
        {right}

        {/* Backend status */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className={cn(
              'w-1.5 h-1.5 rounded-full',
              connected ? 'bg-green-400 status-pulse' : 'bg-red-400/70',
            )}
          />
          <span className="hidden sm:inline font-mono text-[11px]">
            {connected ? t('common.connected') : t('common.offline')}
          </span>
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title={theme === 'dark' ? t('common.theme.switchToLight') : t('common.theme.switchToDark')}
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </div>
    </header>
  )
}
