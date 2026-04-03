import { NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, Server, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'

const NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/agents', icon: Server, label: 'Agents' },
]

export function Sidebar() {
  const { user, logout } = useAuth()
  const location = useLocation()

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
        {NAV.map(({ to, icon: Icon, label }) => (
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
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* User + logout */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2.5 px-2">
          <div className="w-6 h-6 rounded-full bg-foreground/15 flex items-center justify-center text-xs font-semibold font-mono shrink-0">
            {user?.name?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{user?.name ?? 'user'}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email ?? ''}</p>
          </div>
          <button
            onClick={logout}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Sign out"
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </aside>
  )
}
