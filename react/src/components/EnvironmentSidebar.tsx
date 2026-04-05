import React, { useState } from 'react'
import { NavLink, useNavigate, useParams } from 'react-router-dom'
import {
  LayoutDashboard, Server, ClipboardList, ArrowLeft,
  LayoutDashboard as DashboardIcon,
  CalendarClock,
  KeyRound,
  ShieldCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/i18n'
import { useProject } from '@/hooks/useProject'

export function EnvironmentSidebar() {
  const navigate = useNavigate()
  const { envId } = useParams<{ envId: string }>()
  const { t } = useI18n()
  const { environments, currentProject, selectEnvironment } = useProject()
  const currentEnv = environments.find((e) => e.id === envId)

  const navItems = [
    { to: `/environments/${envId}`, icon: DashboardIcon, labelKey: 'env.dashboard', end: true },
    { to: `/environments/${envId}/hosts`, icon: Server, labelKey: 'env.hosts' },
    { to: `/environments/${envId}/tasks`, icon: ClipboardList, labelKey: 'env.tasks' },
    { to: `/environments/${envId}/schedule`, icon: CalendarClock, labelKey: 'env.schedule' },
    { to: `/environments/${envId}/api-keys`, icon: KeyRound, labelKey: 'env.apiKeys' },
    { to: `/environments/${envId}/compliance`, icon: ShieldCheck, labelKey: 'env.compliance' },
  ]

  return (
    <aside
      className="flex flex-col border-r border-border bg-card"
      style={{ width: 'var(--sidebar-width)', minHeight: '100vh' }}
    >
      {/* Back to project */}
      <div className="flex items-center gap-2 px-3 border-b border-border" style={{ height: 'var(--header-height)' }}>
        <button
          onClick={() => navigate('/dashboard')}
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <ArrowLeft size={14} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-mono text-muted-foreground truncate">
            {currentProject?.name}
          </p>
          <p className="text-xs font-semibold font-display truncate">
            {currentEnv?.name ?? 'Environment'}
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {navItems.map(({ to, icon: Icon, labelKey, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors',
                isActive
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
              )
            }
          >
            <Icon size={15} className="shrink-0" />
            <span>{t(labelKey)}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
