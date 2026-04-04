import React, {useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {useNavigate} from 'react-router-dom'
import {
    UserPlus,
    Trash2,
    ChevronRight,
    CheckCircle2,
    Clock,
    Loader2,
    Plus,
    Search,
} from 'lucide-react'
import {Header} from '@/components/Header'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Skeleton} from '@/components/ui/skeleton'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {
    stubGetProjectMembers,
    stubInviteMember,
    stubRemoveMember,
    stubSearchUsers,
} from '@/api/stubs'
import type {UserSearchResult} from '@/api/types'
import {useI18n} from '@/i18n'
import {useProject} from '@/hooks/useProject'
import {formatDate} from '@/lib/utils'

export default function ProjectMembers() {
    const navigate = useNavigate()
    const {t} = useI18n()
    const {currentProject, initialized} = useProject()
    const [inviteEmail, setInviteEmail] = useState('')
    const [inviting, setInviting] = useState(false)
    const [searching, setSearching] = useState(false)
    const [searchResults, setSearchResults] = useState<UserSearchResult[]>([])
    const [error, setError] = useState('')
    const [removingId, setRemovingId] = useState<string | null>(null)
    const searchTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

    const {data: members = [], isLoading, refetch} = useQuery({
        queryKey: ['members', currentProject?.id],
        queryFn: () => stubGetProjectMembers(currentProject?.id ?? ''),
        enabled: !!currentProject && initialized,
        refetchInterval: 10_000,
    })

    React.useEffect(() => {
        return () => {
            if (searchTimerRef.current) {
                clearTimeout(searchTimerRef.current)
            }
        }
    }, [])

    const handleInviteEmailChange = (value: string) => {
        setInviteEmail(value)
        setError('')

        if (searchTimerRef.current) {
            clearTimeout(searchTimerRef.current)
        }

        const normalized = value.trim()
        if (normalized.length < 2) {
            setSearchResults([])
            setSearching(false)
            return
        }

        searchTimerRef.current = setTimeout(async () => {
            setSearching(true)
            try {
                const existingMemberIds = new Set(members.map((member) => member.user_id))
                const results = await stubSearchUsers(normalized)
                setSearchResults(
                    results.filter((result) => !existingMemberIds.has(result.user_id)),
                )
            } catch {
                setSearchResults([])
            } finally {
                setSearching(false)
            }
        }, 300)
    }

    const handleSelectUser = (user: UserSearchResult) => {
        setInviteEmail(user.email)
        setSearchResults([])
        setError('')
    }

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!inviteEmail.trim()) return
        setError('')
        setInviting(true)
        try {
            await stubInviteMember({project_id: currentProject?.id ?? '', email: inviteEmail.trim()})
            setInviteEmail('')
            setSearchResults([])
            refetch()
        } catch (err: any) {
            setError(err.message ?? 'Failed to invite')
        } finally {
            setInviting(false)
        }
    }

    const handleRemove = async (userId: string) => {
        setRemovingId(userId)
        try {
            await stubRemoveMember(userId)
            refetch()
        } catch { /* ignore */
        } finally {
            setRemovingId(null)
        }
    }

    const roleLabels: Record<string, string> = {
        owner: t('member.roleOwner'),
        admin: t('member.roleAdmin'),
        operator: t('member.roleOperator'),
        observer: t('member.roleObserver'),
    }

    const roleVariants: Record<string, 'default' | 'success' | 'blue' | 'muted'> = {
        owner: 'success',
        admin: 'blue',
        operator: 'default',
        observer: 'muted',
    }

    return (
        <>
            <Header title={t('project.members')}/>

            <div className="flex-1 overflow-y-auto">
                <div className="p-5 space-y-4">
                    {/* Invite form */}
                    <div className="rounded-lg border border-border bg-card/50 p-4">
                        <form onSubmit={handleInvite} className="flex items-end gap-3">
                            <div className="flex-1 space-y-1.5">
                                <Label>{t('member.memberEmail')}</Label>
                                <div className="relative">
                                    <Search
                                        size={13}
                                        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                                    />
                                    <Input
                                        type="email"
                                        value={inviteEmail}
                                        onChange={(e) => handleInviteEmailChange(e.target.value)}
                                        placeholder={t('member.memberEmailPlaceholder')}
                                        className="pl-8"
                                    />
                                    {searching && (
                                        <Loader2
                                            size={13}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground"
                                        />
                                    )}
                                    {searchResults.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-md border border-border bg-card shadow-md max-h-40 overflow-y-auto">
                                            {searchResults.map((user) => (
                                                <button
                                                    key={user.user_id}
                                                    type="button"
                                                    onClick={() => handleSelectUser(user)}
                                                    className="flex items-center gap-2.5 w-full px-3 py-2 text-left hover:bg-accent/50 transition-colors first:rounded-t-md last:rounded-b-md"
                                                >
                                                    <div className="w-6 h-6 rounded-full bg-foreground/15 flex items-center justify-center text-xs font-semibold font-mono shrink-0">
                                                        {user.name[0]?.toUpperCase()}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs font-medium truncate">{user.name}</p>
                                                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                                                    </div>
                                                    <Plus size={13} className="text-muted-foreground shrink-0"/>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <Button type="submit" size="sm" disabled={inviting || !inviteEmail.trim()}
                                    className="shrink-0">
                                <UserPlus size={13}/>
                                {t('member.invite')}
                            </Button>
                        </form>
                        {error && <p className="text-xs text-red-400 font-mono mt-2">{error}</p>}
                    </div>

                    {/* Members list */}
                    <div className="rounded-lg border border-border overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                            <tr className="border-b border-border bg-muted/30">
                                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('common.agent')}</th>
                                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('common.status')}</th>
                                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{t('member.projectRole')}</th>
                                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">{t('dashboard.time')}</th>
                                <th className="px-4 py-2.5 w-24"/>
                            </tr>
                            </thead>
                            <tbody>
                            {isLoading && Array.from({length: 5}).map((_, i) => (
                                <tr key={i} className="border-b border-border/50 last:border-0">
                                    <td colSpan={5} className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <Skeleton className="w-7 h-7 rounded-full" />
                                            <div className="flex-1 space-y-1">
                                                <Skeleton className="h-3 w-24" />
                                                <Skeleton className="h-3 w-32" />
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {!isLoading && members.map((member) => {
                                // Project role: admin or member
                                const isProjectAdmin = member.role === 'owner' || member.role === 'admin'
                                return (
                                    <tr
                                        key={member.user_id}
                                        className="border-b border-border/50 last:border-0 hover:bg-accent/30 transition-colors"
                                    >
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2.5">
                                                <div
                                                    className="w-7 h-7 rounded-full bg-foreground/15 flex items-center justify-center text-xs font-semibold font-mono shrink-0">
                                                    {member.name[0]?.toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-xs font-medium truncate">{member.name}</p>
                                                    <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            {member.status === 'accepted' ? (
                                                <Badge variant="success" className="gap-1">
                                                    <CheckCircle2 size={10}/>
                                                    {t('member.roleAccepted')}
                                                </Badge>
                                            ) : (
                                                <Badge variant="warning" className="gap-1">
                                                    <Clock size={10}/>
                                                    {t('member.rolePending')}
                                                </Badge>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <Badge variant={isProjectAdmin ? 'blue' : 'muted'}>
                                                {isProjectAdmin ? t('member.roleAdmin') : t('member.roleMember')}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-3 hidden md:table-cell font-mono text-xs text-muted-foreground">
                                            {formatDate(member.invited_at)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-0.5">
                                                {/* View member detail */}
                                                <button
                                                    onClick={() => navigate(`/members/${member.user_id}`)}
                                                    className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                                                    title="View details"
                                                >
                                                    <ChevronRight size={13}/>
                                                </button>
                                                {/* Remove (not for owner) */}
                                                {member.role !== 'owner' && (
                                                    <button
                                                        onClick={() => handleRemove(member.user_id)}
                                                        className="p-1.5 rounded text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors"
                                                        disabled={removingId === member.user_id}
                                                    >
                                                        <Trash2 size={13}/>
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                            {!isLoading && members.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-4 py-8 text-center text-xs text-muted-foreground">
                                        {t('member.noMembers')}
                                    </td>
                                </tr>
                            )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </>
    )
}
