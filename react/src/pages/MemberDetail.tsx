import React, {useState, useEffect} from 'react'
import {useParams, useNavigate} from 'react-router-dom'
import {ArrowLeft, Trash2, Loader2, CheckCircle2} from 'lucide-react'
import {Header} from '@/components/Header'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
    stubGetProjectMembers,
    stubGetEnvironments,
    stubGetEnvMembers,
    stubUpdateProjectRole,
    stubAssignEnvRole,
    stubRemoveMember
} from '@/api/stubs'
import {useI18n} from '@/i18n'
import {useProject} from '@/hooks/useProject'
import type {MemberRole} from '@/api/types'

export default function MemberDetail() {
    const {memberId} = useParams<{ memberId: string }>()
    const navigate = useNavigate()
    const {t} = useI18n()
    const {currentProject, environments} = useProject()

    const [member, setMember] = React.useState<any>(null)
    const [projectRole, setProjectRole] = useState<'admin' | 'member'>('member')
    const [envRoles, setEnvRoles] = useState<Record<string, string>>({})
    const [saving, setSaving] = useState<string | null>(null)
    const [removing, setRemoving] = useState(false)

    React.useEffect(() => {
        if (!memberId || !currentProject) return
        stubGetProjectMembers(currentProject.id).then((members) => {
            const m = members.find((x) => x.user_id === memberId)
            if (m) {
                setMember(m)
                // Project role: admin or member
                setProjectRole((m.role === 'owner' || m.role === 'admin') ? 'admin' : 'member')
            }
        })
    }, [memberId, currentProject])

    React.useEffect(() => {
        if (!memberId || !currentProject) return
        const roles: Record<string, string> = {}
        Promise.all(environments.map((env) => stubGetEnvMembers(env.id))).then((results) => {
            results.forEach((assignments, i) => {
                const assignment = assignments.find((a) => a.user_id === memberId)
                if (assignment) roles[environments[i].id] = assignment.role
            })
            setEnvRoles(roles)
        })
    }, [memberId, currentProject, environments])

    const handleProjectRoleChange = async (role: 'admin' | 'member') => {
        if (!memberId) return
        setSaving('project')
        try {
            const mappedRole: MemberRole = role === 'admin' ? 'admin' : 'observer'
            await stubUpdateProjectRole(memberId, mappedRole)
            setProjectRole(role)
        } catch { /* ignore */
        } finally {
            setSaving(null)
        }
    }

    const handleEnvRoleChange = async (envId: string, role: string) => {
        if (!memberId) return
        setSaving(envId)
        try {
            if (role !== 'none') {
                await stubAssignEnvRole({user_id: memberId, env_id: envId, role: role as any})
            }
            setEnvRoles((prev) => ({...prev, [envId]: role}))
        } catch { /* ignore */
        } finally {
            setSaving(null)
        }
    }

    const handleRemove = async () => {
        if (!memberId) return
        setRemoving(true)
        try {
            await stubRemoveMember(memberId)
            navigate('/members')
        } catch { /* ignore */
        } finally {
            setRemoving(false)
        }
    }

    if (!member) return null

    const roleLabels: Record<string, string> = {
        owner: t('member.roleOwner'),
        admin: t('member.roleAdmin'),
        operator: t('member.roleOperator'),
        observer: t('member.roleObserver'),
    }

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            <header
                className="flex items-center justify-between px-5 border-b border-border bg-card/50 backdrop-blur-sm"
                style={{height: 'var(--header-height)'}}
            >
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    >
                        <ArrowLeft size={15}/>
                    </button>
                    <h1 className="text-sm font-semibold text-foreground">{member.name}</h1>
                </div>
                {member.role !== 'owner' && (
                    <Button size="sm" variant="destructive" onClick={handleRemove} disabled={removing}>
                        {removing ? <Loader2 size={13} className="animate-spin"/> : <><Trash2
                            size={13}/> {t('member.removeMember')}</>}
                    </Button>
                )}
            </header>

            <div className="flex-1 overflow-auto p-6">
                <div className="max-w-lg space-y-8">
                    {/* Member info */}
                    <div className="flex items-center gap-4">
                        <div
                            className="w-12 h-12 rounded-full bg-foreground/15 flex items-center justify-center text-lg font-semibold font-mono">
                            {member.name[0]?.toUpperCase()}
                        </div>
                        <div>
                            <p className="text-sm font-medium">{member.name}</p>
                            <p className="text-xs text-muted-foreground">{member.email}</p>
                            <Badge variant={member.status === 'accepted' ? 'success' : 'warning'} className="mt-1">
                                {member.status === 'accepted' ? t('member.roleAccepted') : t('member.rolePending')}
                            </Badge>
                        </div>
                    </div>

                    {/* Project role — Admin or Member only */}
                    <div className="space-y-3">
                        <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                            {t('member.projectRole')}
                        </h2>
                        <div className="flex items-center gap-3">
                            <Select value={projectRole} onValueChange={handleProjectRoleChange}
                                    disabled={member.role === 'owner'}>
                                <SelectTrigger className="w-48">
                                    <SelectValue/>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="admin">{roleLabels.admin}</SelectItem>
                                    <SelectItem value="member">{t('member.roleMember')}</SelectItem>
                                </SelectContent>
                            </Select>
                            {saving === 'project' &&
                                <Loader2 size={13} className="animate-spin text-muted-foreground"/>}
                            {saving === null && (
                                <CheckCircle2 size={13} className="text-green-400"/>
                            )}
                        </div>
                    </div>

                    {/* Environment roles — Admin/Operator/Observer/None */}
                    <div className="space-y-3">
                        <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                            {t('member.envRoles')}
                        </h2>
                        <div className="space-y-3">
                            {environments.map((env) => (
                                <div key={env.id} className="flex items-center gap-3">
                                    <span className="text-xs font-mono w-24 truncate">{env.name}</span>
                                    <Select
                                        value={envRoles[env.id] ?? 'none'}
                                        onValueChange={(v) => handleEnvRoleChange(env.id, v)}
                                    >
                                        <SelectTrigger className="w-40">
                                            <SelectValue/>
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">{t('member.noAccess')}</SelectItem>
                                            <SelectItem value="admin">{roleLabels.admin}</SelectItem>
                                            <SelectItem value="operator">{roleLabels.operator}</SelectItem>
                                            <SelectItem value="observer">{roleLabels.observer}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    {saving === env.id &&
                                        <Loader2 size={13} className="animate-spin text-muted-foreground"/>}
                                </div>
                            ))}
                            {environments.length === 0 && (
                                <p className="text-xs text-muted-foreground">{t('project.noEnvironments')}</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
