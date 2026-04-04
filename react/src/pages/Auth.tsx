import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, ArrowRight, UserPlus, Sun, Moon, ArrowLeft, Mail, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { apiLogin, apiRegister, apiVerifyCode, apiResendCode, extractError } from '@/api/auth'
import { useAuth } from '@/hooks/useAuth'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

type AuthMode = 'login' | 'register'
type AuthStep = 'form' | 'verify'

const OTP_LENGTH = 6

export default function Auth() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const { theme, toggle } = useTheme()
  const { t } = useI18n()
  const [mode, setMode] = useState<AuthMode>('login')
  const [step, setStep] = useState<AuthStep>('form')

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''))
  const inputsRef = useRef<(HTMLInputElement | null)[]>([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resendLoading, setResendLoading] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)

  // ── Login / Register submit ──

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) return
    if (mode === 'register' && (!username.trim() || !email.trim())) return
    setError('')
    setLoading(true)
    try {
      if (mode === 'login') {
        const res = await apiLogin({
          username: username.trim(),
          password,
        })
        login(res.token, res.user)
        navigate('/dashboard')
      } else {
        const res = await apiRegister({
          username: username.trim(),
          password,
          email: email.trim(),
        })
        if (res.email_verification_required) {
          setStep('verify')
        } else if (res.auth) {
          login(res.auth.token, res.auth.user)
          navigate('/dashboard')
        }
      }
    } catch (err: any) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }

  // ── OTP logic ──

  const handleOtpChange = (index: number, value: string) => {
    if (value && !/^\d$/.test(value)) return
    const next = [...otp]
    next[index] = value
    setOtp(next)
    if (value && index < OTP_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus()
    }
  }

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputsRef.current[index - 1]?.focus()
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      inputsRef.current[index - 1]?.focus()
    }
    if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus()
    }
  }

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH)
    if (!pasted) return
    const next = [...otp]
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i]
    setOtp(next)
    const focusIdx = Math.min(pasted.length, OTP_LENGTH - 1)
    inputsRef.current[focusIdx]?.focus()
  }

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const code = otp.join('')
    if (code.length !== OTP_LENGTH) return
    setError('')
    setLoading(true)
    try {
      const res = await apiVerifyCode({ username: username.trim(), code })
      login(res.auth.token, res.auth.user)
      navigate('/dashboard')
    } catch (err: any) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendCooldown > 0) return
    setError('')
    setResendLoading(true)
    try {
      await apiResendCode({ username: username.trim() })
      setResendCooldown(60)
    } catch (err: any) {
      setError(extractError(err))
    } finally {
      setResendLoading(false)
    }
  }

  // Cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return
    const id = setInterval(() => setResendCooldown((c) => c - 1), 1000)
    return () => clearInterval(id)
  }, [resendCooldown])

  // Focus first OTP input
  useEffect(() => {
    if (step === 'verify') {
      setTimeout(() => inputsRef.current[0]?.focus(), 100)
    }
  }, [step])

  const switchMode = () => {
    setMode(mode === 'login' ? 'register' : 'login')
    setError('')
    setUsername('')
    setEmail('')
    setPassword('')
  }

  const backToForm = () => {
    setStep('form')
    setOtp(Array(OTP_LENGTH).fill(''))
    setError('')
  }

  const isOtpComplete = otp.every((d) => d !== '')

  // ── Render ──

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

      {/* Theme toggle */}
      <button
        onClick={toggle}
        className="fixed top-4 right-4 z-20 p-2 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-accent/50 transition-colors"
        title={theme === 'dark' ? t('common.theme.switchToLight') : t('common.theme.switchToDark')}
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
              {t('auth.platformName')}
            </p>
          </div>
        </div>

        {step === 'form' ? (
          /* ───── Form Step ───── */
          <div className="rounded-lg border border-border bg-card/80 backdrop-blur-sm p-7 shadow-2xl">
            <div className="mb-6">
              <h1 className="text-lg font-semibold font-display tracking-tight">
                {mode === 'login' ? t('auth.signIn') : t('auth.createAccount')}
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                {mode === 'login'
                  ? t('auth.signInSubtitle')
                  : t('auth.registerSubtitle')}
              </p>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-4">
              {mode === 'register' && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="username">{t('auth.username')}</Label>
                    <Input
                      id="username"
                      type="text"
                      placeholder={t('auth.usernamePlaceholder')}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      autoComplete="username"
                      autoFocus
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="email">{t('auth.email')}</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder={t('auth.emailPlaceholder')}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      required
                    />
                  </div>
                </>
              )}

              {mode === 'login' && (
                <div className="space-y-1.5">
                  <Label htmlFor="username">{t('auth.username')}</Label>
                  <Input
                    id="username"
                    type="text"
                    placeholder={t('auth.usernamePlaceholder')}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    autoFocus
                    required
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="password">{t('auth.password')}</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder={t('auth.passwordPlaceholder')}
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
                disabled={loading || !password || !username.trim() || (mode === 'register' && !email.trim())}
              >
                {loading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <>
                    {mode === 'login' ? t('auth.signIn') : t('auth.createAccount')}
                    {mode === 'login' ? <ArrowRight size={14} /> : <UserPlus size={14} />}
                  </>
                )}
              </Button>
            </form>
          </div>
        ) : (
          /* ───── OTP Verify Step ───── */
          <div className="rounded-lg border border-border bg-card/80 backdrop-blur-sm p-7 shadow-2xl">
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-4">
                <button
                  onClick={backToForm}
                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <ArrowLeft size={14} />
                </button>
              </div>
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-accent/50 mb-4">
                <Mail size={18} className="text-foreground/70" />
              </div>
              <h1 className="text-lg font-semibold font-display tracking-tight">
                {t('auth.verifyEmail')}
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('auth.verifySubtitle', { email })}
              </p>
            </div>

            <form onSubmit={handleVerifySubmit} className="space-y-5">
              {/* OTP Inputs */}
              <div className="flex items-center justify-center gap-2" onPaste={handleOtpPaste}>
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { inputsRef.current[i] = el }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    className={cn(
                      'w-10 h-12 text-center text-lg font-mono rounded-md border bg-background',
                      'text-foreground outline-none transition-colors',
                      'focus:border-foreground focus:ring-1 focus:ring-foreground/20',
                      digit && 'border-foreground/50',
                    )}
                    aria-label={`Digit ${i + 1}`}
                  />
                ))}
              </div>

              {error && (
                <p className="text-xs text-red-400 font-mono text-center">{error}</p>
              )}

              {/* Resend */}
              <div className="text-center">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendLoading || resendCooldown > 0}
                  className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                >
                  {resendLoading ? (
                    <Loader2 size={12} className="inline animate-spin mr-1" />
                  ) : resendCooldown > 0 ? (
                    `Resend in ${resendCooldown}s`
                  ) : (
                    <RefreshCw size={12} className="inline mr-1" />
                  )}
                  {resendCooldown > 0 ? '' : 'Resend code'}
                </button>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={loading || !isOtpComplete}
              >
                {loading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <>
                    {t('auth.verifyButton')}
                    <ArrowRight size={14} />
                  </>
                )}
              </Button>
            </form>
          </div>
        )}

        {/* Switch mode — only on form step */}
        {step === 'form' && (
          <div className="mt-5 text-center">
            <button
              type="button"
              onClick={switchMode}
              className="text-xs text-muted-foreground/70 hover:text-foreground transition-colors font-mono"
            >
              {mode === 'login' ? (
                <>
                  {t('auth.noAccount')}{' '}
                  <span className="text-foreground/80">{t('auth.signUp')}</span>
                </>
              ) : (
                <>
                  {t('auth.hasAccount')}{' '}
                  <span className="text-foreground/80">{t('auth.signIn')}</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Footer note */}
        <p className="mt-5 text-center text-xs text-muted-foreground/50 font-mono">
          {t('auth.footer')}
        </p>
      </div>
    </div>
  )
}
