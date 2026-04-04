import React, {useState} from 'react'
import {User, Mail, Key, Save, ArrowLeft} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {useAuth} from '@/hooks/useAuth'
import {useNavigate} from 'react-router-dom'
import {useI18n} from '@/i18n'
import {apiUpdateMe, apiInitiatePasswordChange, extractError} from '@/api/auth'

export default function ProfileSettings() {
    const {user, login, token} = useAuth()
    const navigate = useNavigate()
    const {t} = useI18n()

    const [name, setName] = useState(user?.name ?? '')
    const [email] = useState(user?.email ?? '')
    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [profileSaved, setProfileSaved] = useState(false)
    const [passwordEmailSent, setPasswordEmailSent] = useState(false)
    const [profileLoading, setProfileLoading] = useState(false)
    const [passwordLoading, setPasswordLoading] = useState(false)
    const [error, setError] = useState('')

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!name.trim()) return
        setProfileLoading(true)
        setError('')
        try {
            const updated = await apiUpdateMe(name.trim())
            if (token) login(token, updated)
            setProfileSaved(true)
            setTimeout(() => setProfileSaved(false), 2000)
        } catch (err: any) {
            setError(extractError(err))
        } finally {
            setProfileLoading(false)
        }
    }

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        if (!currentPassword || !newPassword || !confirmPassword) {
            setError(t('profile.fillAllPasswords'))
            return
        }
        if (newPassword !== confirmPassword) {
            setError(t('profile.passwordsMismatch'))
            return
        }
        if (newPassword.length < 6) {
            setError(t('profile.passwordMinLength'))
            return
        }
        setPasswordLoading(true)
        try {
            await apiInitiatePasswordChange({
                current_password: currentPassword,
                new_password: newPassword,
            })
            setPasswordEmailSent(true)
            setCurrentPassword('')
            setNewPassword('')
            setConfirmPassword('')
        } catch (err: any) {
            setError(extractError(err))
        } finally {
            setPasswordLoading(false)
        }
    }

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header */}
            <header
                className="flex items-center gap-3 px-5 border-b border-border bg-card/50 backdrop-blur-sm"
                style={{height: 'var(--header-height)'}}
            >
                <button
                    onClick={() => navigate(-1)}
                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                    <ArrowLeft size={15}/>
                </button>
                <h1 className="text-sm font-semibold text-foreground">{t('profile.title')}</h1>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
                <div className="max-w-lg space-y-8">
                    {/* Profile info */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div
                                className="w-12 h-12 rounded-full bg-foreground/15 flex items-center justify-center text-lg font-semibold font-mono">
                                {user?.name?.[0]?.toUpperCase() ?? 'U'}
                            </div>
                            <div>
                                <p className="text-sm font-medium">{user?.name}</p>
                                <p className="text-xs text-muted-foreground">{user?.email}</p>
                            </div>
                        </div>
                    </div>

                    {/* Edit profile */}
                    <form onSubmit={handleSaveProfile} className="space-y-4">
                        <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                            {t('profile.profileSection')}
                        </h2>

                        <div className="space-y-1.5">
                            <Label htmlFor="name">{t('profile.displayName')}</Label>
                            <div className="relative">
                                <User
                                    size={14}
                                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                                />
                                <Input
                                    id="name"
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="pl-9"
                                    placeholder={t('profile.namePlaceholder')}
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="email">{t('profile.email')}</Label>
                            <div className="relative">
                                <Mail
                                    size={14}
                                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                                />
                                <Input
                                    id="email"
                                    type="email"
                                    value={email}
                                    disabled
                                    className="pl-9 opacity-60"
                                />
                            </div>
                            <p className="text-xs text-muted-foreground/60">
                                {t('profile.emailLocked')}
                            </p>
                        </div>

                        <Button type="submit" size="sm" disabled={profileLoading}>
                            <Save size={13}/>
                            {profileSaved ? t('common.saved') : t('common.saveChanges')}
                        </Button>
                    </form>

                    {/* Change password */}
                    <form onSubmit={handleChangePassword} className="space-y-4 pt-4 border-t border-border">
                        <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                            {t('profile.passwordSection')}
                        </h2>

                        <div className="space-y-1.5">
                            <Label htmlFor="current-password">{t('profile.currentPassword')}</Label>
                            <div className="relative">
                                <Key
                                    size={14}
                                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                                />
                                <Input
                                    id="current-password"
                                    type="password"
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    className="pl-9"
                                    placeholder={t('profile.passwordPlaceholder')}
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="new-password">{t('profile.newPassword')}</Label>
                            <div className="relative">
                                <Key
                                    size={14}
                                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                                />
                                <Input
                                    id="new-password"
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="pl-9"
                                    placeholder={t('profile.passwordPlaceholder')}
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="confirm-password">{t('profile.confirmPassword')}</Label>
                            <div className="relative">
                                <Key
                                    size={14}
                                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                                />
                                <Input
                                    id="confirm-password"
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="pl-9"
                                    placeholder={t('profile.passwordPlaceholder')}
                                />
                            </div>
                        </div>

                        {error && (
                            <p className="text-xs text-red-400 font-mono">{error}</p>
                        )}

                        <Button type="submit" size="sm" variant="secondary" disabled={passwordLoading}>
                            {t('profile.changePassword')}
                        </Button>

                        {passwordEmailSent && (
                            <p className="text-xs text-green-400 font-mono">
                                Письмо с подтверждением отправлено на {email}
                            </p>
                        )}
                    </form>
                </div>
            </div>
        </div>
    )
}
