import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Server, LogOut, Settings, ChevronUp, ChevronRight, Languages, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useI18n } from '@/i18n'
import type { Locale } from '@/i18n'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'

const NAV = [
  { to: '/dashboard', icon: LayoutDashboard, labelKey: 'sidebar.dashboard' },
  { to: '/agents', icon: Server, labelKey: 'sidebar.agents' },
]

export function Sidebar() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const { locale, t, setLocale } = useI18n()

  const locales: { code: Locale; label: string }[] = [
    { code: 'en', label: t('languages.en') },
    { code: 'ru', label: t('languages.ru') },
  ]

  return (
    <aside
      className="flex flex-col border-r border-border bg-card"
      style={{ width: 'var(--sidebar-width)', minHeight: '100vh' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 border-b border-border" style={{ height: 'var(--header-height)' }}>
        <div className="flex items-center justify-center w-6 h-6 rounded bg-foreground/10 border border-border/50">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-foreground/70">
            <rect x="1" y="1" width="4" height="4" rx="0.5" fill="currentColor" />
            <rect x="7" y="1" width="4" height="4" rx="0.5" fill="currentColor" opacity="0.4" />
            <rect x="1" y="7" width="4" height="4" rx="0.5" fill="currentColor" opacity="0.4" />
            <rect x="7" y="7" width="4" height="4" rx="0.5" fill="currentColor" />
          </svg>
        </div>
        <span className="text-sm font-semibold tracking-tight font-display">DIAG</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {NAV.map(({ to, icon: Icon, labelKey }) => (
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
  )
}
