import React from 'react'
import { useSearchParams } from 'react-router-dom'
import { Sun, Moon } from 'lucide-react'
import { API_BASE_URL } from '@/api/client'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/i18n'
import { useProject } from '@/hooks/useProject'
import { cn } from '@/lib/utils'
import { Breadcrumb, type BreadcrumbSegment } from '@/components/Breadcrumb'

interface EnvironmentHeaderProps {
  envId: string
  title: string
  right?: React.ReactNode
  backButton?: React.ReactNode
}

let _backendStatus: boolean | null = null
const _backendListeners = new Set<(v: boolean) => void>()
let _backendIntervalId: ReturnType<typeof setInterval> | null = null

async function _checkBackend() {
  try {
    const res = await fetch(`${API_BASE_URL}/health`, { signal: AbortSignal.timeout(2000) })
    _backendStatus = res.ok
  } catch {
    _backendStatus = false
  }
  _backendListeners.forEach((fn) => fn(_backendStatus!))
}

function subscribeBackendStatus(fn: (v: boolean) => void): () => void {
  _backendListeners.add(fn)
  if (_backendStatus !== null) fn(_backendStatus)
  if (_backendIntervalId === null) {
    _checkBackend()
    _backendIntervalId = setInterval(_checkBackend, 10_000)
  }
  return () => {
    _backendListeners.delete(fn)
  }
}

function useBackendStatus() {
  const [connected, setConnected] = React.useState<boolean>(_backendStatus ?? false)
  React.useEffect(() => subscribeBackendStatus(setConnected), [])
  return connected
}

export function EnvironmentHeader({ envId, title, right, backButton }: EnvironmentHeaderProps) {
  const { theme, toggle } = useTheme()
  const { t } = useI18n()
  const { currentProject, environments } = useProject()
  const currentEnv = environments.find((e) => e.id === envId)
  const connected = useBackendStatus()

  const segments: BreadcrumbSegment[] = []
  if (currentProject) {
    segments.push({ label: currentProject.name })
  }
  if (currentEnv) {
    segments.push({ label: currentEnv.name })
  }
  if (title) {
    segments.push({ label: title, active: true })
  }

  return (
    <header
      className="flex items-center justify-between px-5 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10"
      style={{ height: 'var(--header-height)' }}
    >
      <div className="flex items-center gap-2">
        {backButton}
        {segments.length > 0 && <Breadcrumb segments={segments} />}
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
