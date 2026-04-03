import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, ArrowRight, UserPlus, Sun, Moon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { stubLogin, stubRegister } from '@/api/stubs'
import { useAuth } from '@/hooks/useAuth'
import { useTheme } from '@/hooks/useTheme'
import { cn } from '@/lib/utils'

type AuthMode = 'login' | 'register'

export default function Auth() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const { theme, toggle } = useTheme()
  const [mode, setMode] = useState<AuthMode>('login')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password || (mode === 'register' && !name)) return
    setError('')
    setLoading(true)
    try {
      if (mode === 'login') {
        const res = await stubLogin({ email, password })
        login(res.token, res.user)
      } else {
        const res = await stubRegister({ email, password, name })
        login(res.token, res.user)
      }
      navigate('/dashboard')
    } catch (err: any) {
      setError(err.message ?? 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  const switchMode = () => {
    setMode(mode === 'login' ? 'register' : 'login')
    setError('')
    setEmail('')
    setPassword('')
    setName('')
  }

  return (
    <div className="relative min-h-screen bg-background dot-grid noise-bg flex items-center justify-center">
      {/* Radial vignette */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background: 'radial-gradient(ellipse 80% 60% at 50% 50%, transparent 40%, hsl(var(--background)) 100%)',
          zIndex: 1,
        }}
      />

      {/* Theme toggle — top-right corner */}
      <button
        onClick={toggle}
        className="fixed top-4 right-4 z-20 p-2 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-accent/50 transition-colors"
        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      >
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      <div className="relative z-10 w-full max-w-sm px-4 animate-fade-in">
        {/* Logo mark */}
        <div className="mb-10 flex flex-col items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg border border-border/60 bg-card/80">
            <svg width="18" height="18" viewBox="0 0 12 12" fill="none" className="text-foreground/60">
              <rect x="1" y="1" width="4" height="4" rx="0.5" fill="currentColor" />
              <rect x="7" y="1" width="4" height="4" rx="0.5" fill="currentColor" opacity="0.35" />
              <rect x="1" y="7" width="4" height="4" rx="0.5" fill="currentColor" opacity="0.35" />
              <rect x="7" y="7" width="4" height="4" rx="0.5" fill="currentColor" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-xs font-mono tracking-[0.2em] text-muted-foreground uppercase">
              Diagnostics Platform
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-lg border border-border bg-card/80 backdrop-blur-sm p-7 shadow-2xl">
          <div className="mb-6">
            <h1 className="text-lg font-semibold font-display tracking-tight">
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {mode === 'login'
                ? 'Enter your credentials to continue'
                : 'Fill in the details to get started'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Full name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  autoFocus
                  required
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus={mode === 'login'}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
              />
            </div>

            {error && (
              <p className="text-xs text-red-400 font-mono">{error}</p>
            )}

            <Button
              type="submit"
              className="w-full mt-2"
              disabled={loading || !email || !password || (mode === 'register' && !name)}
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <>
                  {mode === 'login' ? 'Sign in' : 'Create account'}
                  {mode === 'login' ? <ArrowRight size={14} /> : <UserPlus size={14} />}
                </>
              )}
            </Button>
          </form>
        </div>

        {/* Switch mode */}
        <div className="mt-5 text-center">
          <button
            type="button"
            onClick={switchMode}
            className="text-xs text-muted-foreground/70 hover:text-foreground transition-colors font-mono"
          >
            {mode === 'login' ? (
              <>
                Don't have an account? <span className="text-foreground/80">Sign up</span>
              </>
            ) : (
              <>
                Already have an account? <span className="text-foreground/80">Sign in</span>
              </>
            )}
          </button>
        </div>

        {/* Footer note */}
        <p className="mt-5 text-center text-xs text-muted-foreground/50 font-mono">
          infrastructure · diagnostics · v1.0
        </p>
      </div>
    </div>
  )
}
