import React, { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Server, Users, LogOut, Settings, ChevronUp, ChevronRight,
  Languages, Check, ChevronsUpDown, Plus, FolderOpen, ChevronDown, ChevronRight as ChevronRightIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useProject } from '@/hooks/useProject'
import { useI18n } from '@/i18n'
import type { Locale } from '@/i18n'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import { CreateProjectModal } from '@/components/CreateProjectModal'
import { CreateEnvironmentModal } from '@/components/CreateEnvironmentModal'
import { stubGetEnvironments } from '@/api/stubs'

export function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { t, setLocale, locale } = useI18n()
  const { projects, currentProject, environments, currentEnv, selectProject, selectEnvironment, createProject, loading } = useProject()
  const [createOpen, setCreateOpen] = useState(false)
  const [createEnvOpen, setCreateEnvOpen] = useState(false)
  const [envsExpanded, setEnvsExpanded] = useState(true)

  const locales: { code: Locale; label: string }[] = [
    { code: 'en', label: t('languages.en') },
    { code: 'ru', label: t('languages.ru') },
  ]

  const mainNav = [
    { to: '/dashboard', icon: LayoutDashboard, labelKey: 'sidebar.dashboard' },
    { to: '/agents', icon: Server, labelKey: 'sidebar.agents' },
    { to: '/members', icon: Users, labelKey: 'sidebar.members' },
  ]

  return (
    <>
      <aside
        className="flex flex-col border-r border-border bg-card"
        style={{ width: 'var(--sidebar-width)', minHeight: '100vh' }}
      >
        {/* Logo + Project selector */}
        <div className="flex items-center gap-1.5 px-2 border-b border-border" style={{ height: 'var(--header-height)' }}>
          <div className="flex items-center justify-center w-6 h-6 rounded bg-foreground/10 border border-border/50 shrink-0">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-foreground/70">
              <rect x="1" y="1" width="4" height="4" rx="0.5" fill="currentColor" />
              <rect x="7" y="1" width="4" height="4" rx="0.5" fill="currentColor" opacity="0.4" />
              <rect x="1" y="7" width="4" height="4" rx="0.5" fill="currentColor" opacity="0.4" />
              <rect x="7" y="7" width="4" height="4" rx="0.5" fill="currentColor" />
            </svg>
          </div>

          {/* Project dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1 flex-1 min-w-0 text-left px-1.5 py-1 rounded-md hover:bg-accent/50 transition-colors">
                <span className="text-xs font-semibold tracking-tight font-display truncate">
                  {currentProject?.name ?? 'DIAG'}
                </span>
                <ChevronsUpDown size={11} className="text-muted-foreground shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="bottom" className="w-56">
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {t('project.title')}
              </DropdownMenuLabel>
              {projects.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  onClick={() => selectProject(p.id)}
                  className={cn(p.id === currentProject?.id && 'bg-accent')}
                >
                  <FolderOpen size={13} className="mr-2 text-muted-foreground" />
                  <span className="truncate">{p.name}</span>
                  {p.id === currentProject?.id && <Check size={13} className="ml-auto shrink-0" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setCreateOpen(true)}>
                <Plus size={13} className="mr-2" />
                {t('project.createProject')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {mainNav.map(({ to, icon: Icon, labelKey }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors group',
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

          {/* Environments collapsible */}
          <div>
            <div className="flex items-center justify-between">
              <button
                onClick={() => setEnvsExpanded(!envsExpanded)}
                className="flex items-center gap-2.5 flex-1 px-2.5 py-2 rounded-md text-sm transition-colors text-muted-foreground hover:text-foreground hover:bg-accent/50"
              >
                <ChevronDown
                  size={15}
                  className={cn('shrink-0 transition-transform', !envsExpanded && '-rotate-90')}
                />
                <span>{t('sidebar.environments')}</span>
              </button>
              <button
                onClick={() => setCreateEnvOpen(true)}
                className="p-1 mr-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                title={t('project.createEnvironment')}
              >
                <Plus size={14} />
              </button>
            </div>

            {envsExpanded && (
              <div className="ml-5 mt-0.5 space-y-0.5 border-l border-border/50 pl-2">
                {environments.map((env) => (
                  <button
                    key={env.id}
                    onClick={() => navigate(`/environments/${env.id}`)}
                    className={cn(
                      'flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs transition-colors',
                      env.id === currentEnv?.id
                        ? 'bg-accent text-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                    )}
                  >
                    <ChevronRightIcon size={12} className="shrink-0" />
                    <span className="truncate">{env.name}</span>
                  </button>
                ))}
                {environments.length === 0 && (
                  <p className="px-2 py-1 text-xs text-muted-foreground/50">
                    {t('project.noEnvironments')}
                  </p>
                )}
              </div>
            )}
          </div>
        </nav>

        {/* User dropdown */}
        <div className="border-t border-border p-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2.5 w-full px-2 py-2 rounded-md hover:bg-accent/50 transition-colors text-left">
                <div className="w-6 h-6 rounded-full bg-foreground/15 flex items-center justify-center text-xs font-semibold font-mono shrink-0">
                  {user?.name?.[0]?.toUpperCase() ?? 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{user?.name ?? 'user'}</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email ?? ''}</p>
                </div>
                <ChevronUp size={12} className="text-muted-foreground shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-56">
              <DropdownMenuLabel>
                <p className="text-xs font-medium">{user?.name}</p>
                <p className="text-xs text-muted-foreground font-mono">{user?.email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/settings/profile')}>
                <Settings size={13} className="mr-2" />
                {t('sidebar.profileSettings')}
              </DropdownMenuItem>

              {/* Language sub-menu */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Languages size={13} className="mr-2" />
                  {t('sidebar.languages')}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent sideOffset={8} alignOffset={-4}>
                  {locales.map(({ code, label }) => (
                    <DropdownMenuItem
                      key={code}
                      onClick={() => setLocale(code)}
                      className={cn(locale === code && 'bg-accent')}
                    >
                      {label}
                      {locale === code && <Check size={13} className="ml-auto" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-red-400 focus:text-red-400 focus:bg-red-400/10">
                <LogOut size={13} className="mr-2" />
                {t('sidebar.signOut')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <CreateProjectModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={createProject}
      />
      <CreateEnvironmentModal
        open={createEnvOpen}
        onClose={() => setCreateEnvOpen(false)}
        onCreated={() => {}}
      />
    </>
  )
}
