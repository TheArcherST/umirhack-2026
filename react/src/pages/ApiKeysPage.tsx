import React, {useState} from 'react'
import {useQuery, useQueryClient} from '@tanstack/react-query'
import {useParams} from 'react-router-dom'
import {
    Key,
    Plus,
    Copy,
    CheckCircle2,
    Shield,
    Eye,
    AlertTriangle,
    Trash2,
    XCircle,
    Clock,
} from 'lucide-react'
import {EnvironmentHeader} from '@/components/EnvironmentHeader'
import {Button} from '@/components/ui/button'
import {Badge} from '@/components/ui/badge'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {Skeleton} from '@/components/ui/skeleton'
import {stubGetApiKeys, stubCreateApiKey, stubRevokeApiKey, stubDeleteApiKey} from '@/api/stubs'
import type {ApiKey, ApiKeyRole, ApiKeyCreateResponse} from '@/api/types'
import {useI18n} from '@/i18n'
import {formatDate} from '@/lib/utils'

const EXPIRY_OPTIONS: {value: string; labelKey: string;}[] = [
    {value: '1d', labelKey: 'apiKey.expiry1d'},
    {value: '7d', labelKey: 'apiKey.expiry7d'},
    {value: '30d', labelKey: 'apiKey.expiry30d'},
    {value: '90d', labelKey: 'apiKey.expiry90d'},
    {value: 'never', labelKey: 'apiKey.expiryNever'},
]

export default function ApiKeysPage() {
    const {envId} = useParams<{envId: string}>()
    const {t} = useI18n()
    const queryClient = useQueryClient()
    const [createOpen, setCreateOpen] = useState(false)
    const [createdKey, setCreatedKey] = useState<ApiKeyCreateResponse | null>(null)
    const [copiedId, setCopiedId] = useState<string | null>(null)
    const [revokeId, setRevokeId] = useState<string | null>(null)
    const [deleteId, setDeleteId] = useState<string | null>(null)

    const {data: keys = [], isLoading} = useQuery({
        queryKey: ['api-keys', envId],
        queryFn: () => stubGetApiKeys(envId!),
        enabled: !!envId,
        refetchInterval: 30_000,
    })

    const handleCreate = async (payload: {name: string; role: ApiKeyRole; expiry: string}) => {
        if (!envId) return
        const result = await stubCreateApiKey(envId, payload)
        setCreatedKey(result)
        queryClient.invalidateQueries({queryKey: ['api-keys', envId]})
    }

    const handleRevoke = async (keyId: string) => {
        if (!envId) return
        await stubRevokeApiKey(envId, keyId)
        setRevokeId(null)
        queryClient.invalidateQueries({queryKey: ['api-keys', envId]})
    }

    const handleDelete = async (keyId: string) => {
        if (!envId) return
        await stubDeleteApiKey(envId, keyId)
        setDeleteId(null)
        queryClient.invalidateQueries({queryKey: ['api-keys', envId]})
    }

    const copyKey = async (key: string) => {
        try {
            await navigator.clipboard.writeText(key)
            setCopiedId(key)
            setTimeout(() => setCopiedId(null), 2000)
        } catch {
            // ignore
        }
    }

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            <EnvironmentHeader envId={envId!} title={t('apiKey.title')} />

            <div className="flex-1 overflow-y-auto">
                <div className="p-5 space-y-4">
                    {/* Create button */}
                    <div className="flex justify-end">
                        <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5 h-7 text-xs">
                            <Plus size={12} />
                            {t('apiKey.createKey')}
                        </Button>
                    </div>

                    {/* Keys list */}
                    {isLoading ? (
                        <div className="space-y-3">
                            {Array.from({length: 3}).map((_, i) => (
                                <div key={i} className="rounded-lg border border-border bg-card p-4 space-y-2">
                                    <Skeleton className="h-4 w-32" />
                                    <Skeleton className="h-3 w-48" />
                                    <div className="flex gap-2">
                                        <Skeleton className="h-5 w-16 rounded" />
                                        <Skeleton className="h-5 w-16 rounded" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : keys.length === 0 ? (
                        <div className="rounded-lg border border-border bg-card/50 p-8 text-center">
                            <Key size={32} className="mx-auto text-muted-foreground/40 mb-3" />
                            <p className="text-sm font-medium text-foreground">{t('apiKey.noKeys')}</p>
                            <p className="text-xs text-muted-foreground mt-1">{t('apiKey.noKeysDesc')}</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {keys.map((key) => (
                                <div key={key.id} className="rounded-lg border border-border bg-card p-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <Key size={14} className="text-muted-foreground shrink-0" />
                                                <p className="text-sm font-mono font-medium truncate">{key.name}</p>
                                            </div>
                                            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                                                <span>{t('apiKey.createdBy')}: {key.created_by}</span>
                                                <span>{t('common.created')}: {formatDate(key.created_at)}</span>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2 mt-2">
                                                <Badge variant={key.role === 'operator' ? 'blue' : 'muted'} className="gap-1">
                                                    {key.role === 'operator' ? (
                                                        <Shield size={10} />
                                                    ) : (
                                                        <Eye size={10} />
                                                    )}
                                                    {key.role === 'operator' ? t('apiKey.roleOperator') : t('apiKey.roleObserver')}
                                                </Badge>
                                                <StatusBadge apiKey={key} />
                                                {key.expires_at && (
                                                    <span className="text-xs text-muted-foreground font-mono">
                                                        {t('apiKey.expiryLabel')}: {formatDate(key.expires_at)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        {key.is_active && (
                                            <div className="flex items-center gap-1 shrink-0">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-7 text-xs gap-1"
                                                    onClick={() => setRevokeId(key.id)}
                                                >
                                                    <XCircle size={12} />
                                                    {t('apiKey.revokeKey')}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-7 text-xs gap-1 text-red-400 hover:text-red-300 hover:border-red-400/30"
                                                    onClick={() => setDeleteId(key.id)}
                                                >
                                                    <Trash2 size={12} />
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Create dialog */}
            <CreateKeyModal
                open={createOpen && !createdKey}
                onClose={() => {
                    setCreateOpen(false)
                    setCreatedKey(null)
                }}
                onCreated={handleCreate}
            />

            {/* Created key - copy dialog */}
            {createdKey && (
                <Dialog open={!!createdKey} onOpenChange={(open) => !open && setCreatedKey(null)}>
                    <DialogContent>
                        <DialogHeader>
                            <div className="flex items-center gap-2">
                                <CheckCircle2 size={16} className="text-green-400" />
                                <DialogTitle>{t('apiKey.keyCreated')}</DialogTitle>
                            </div>
                            <DialogDescription className="font-mono text-xs">
                                {t('apiKey.copyWarning')}
                            </DialogDescription>
                        </DialogHeader>

                        <div className="px-6 pb-4 space-y-3">
                            <div>
                                <Label className="text-xs">{t('apiKey.nameLabel')}</Label>
                                <p className="text-sm font-mono mt-1">{createdKey.name}</p>
                            </div>
                            <div>
                                <Label className="text-xs">{t('apiKey.roleLabel')}</Label>
                                <p className="text-sm mt-1">
                                    {createdKey.role === 'operator' ? t('apiKey.roleOperator') : t('apiKey.roleObserver')}
                                </p>
                            </div>
                            <div>
                                <Label className="text-xs">API Key</Label>
                                <div className="flex items-center gap-2 mt-1">
                                    <code className="flex-1 text-xs font-mono bg-muted/50 rounded px-3 py-2 break-all select-all">
                                        {createdKey.key}
                                    </code>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="shrink-0 h-8"
                                        onClick={() => copyKey(createdKey.key)}
                                    >
                                        {copiedId === createdKey.key ? (
                                            <CheckCircle2 size={14} className="text-green-400" />
                                        ) : (
                                            <Copy size={14} />
                                        )}
                                    </Button>
                                </div>
                            </div>
                            <div>
                                <Label className="text-xs">Usage</Label>
                                <code className="block text-xs font-mono bg-muted/50 rounded px-3 py-2 mt-1">
                                    Authorization: Bearer {createdKey.key}
                                </code>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button size="sm" onClick={() => setCreatedKey(null)}>
                                {t('common.close')}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}

            {/* Revoke confirm */}
            <ConfirmDialog
                open={!!revokeId}
                onClose={() => setRevokeId(null)}
                onConfirm={() => revokeId && handleRevoke(revokeId)}
                title={t('apiKey.revokeKey')}
                description={t('apiKey.revokeConfirm')}
                variant="warning"
            />

            {/* Delete confirm */}
            <ConfirmDialog
                open={!!deleteId}
                onClose={() => setDeleteId(null)}
                onConfirm={() => deleteId && handleDelete(deleteId)}
                title={t('apiKey.deleteKey')}
                description={t('apiKey.deleteConfirm')}
                variant="destructive"
            />
        </div>
    )
}

function StatusBadge({apiKey}: {apiKey: ApiKey}) {
    const {t} = useI18n()
    if (apiKey.revoked_at) {
        return (
            <Badge variant="destructive" className="gap-1">
                <XCircle size={10} />
                {t('apiKey.revoked')}
            </Badge>
        )
    }
    if (!apiKey.is_active) {
        return (
            <Badge variant="warning" className="gap-1">
                <Clock size={10} />
                {t('apiKey.expired')}
            </Badge>
        )
    }
    return (
        <Badge variant="success" className="gap-1">
            <CheckCircle2 size={10} />
            {t('apiKey.active')}
        </Badge>
    )
}

function CreateKeyModal({
    open,
    onClose,
    onCreated,
}: {
    open: boolean
    onClose: () => void
    onCreated: (payload: {name: string; role: ApiKeyRole; expiry: string}) => Promise<void>
}) {
    const {t} = useI18n()
    const [name, setName] = useState('')
    const [role, setRole] = useState<ApiKeyRole>('operator')
    const [expiry, setExpiry] = useState('7d')
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!name.trim()) return
        setLoading(true)
        try {
            await onCreated({name: name.trim(), role, expiry})
            setName('')
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t('apiKey.createKey')}</DialogTitle>
                    <DialogDescription>{t('apiKey.noKeysDesc')}</DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit}>
                    <div className="px-6 pb-4 space-y-4">
                        <div className="space-y-1.5">
                            <Label>{t('apiKey.nameLabel')}</Label>
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={t('apiKey.namePlaceholder')}
                                className="font-mono text-xs"
                                autoFocus
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label>{t('apiKey.roleLabel')}</Label>
                            <Select value={role} onValueChange={(v) => setRole(v as ApiKeyRole)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="operator">
                                        <div className="flex items-center gap-2">
                                            <Shield size={12} />
                                            <span>{t('apiKey.roleOperator')}</span>
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="observer">
                                        <div className="flex items-center gap-2">
                                            <Eye size={12} />
                                            <span>{t('apiKey.roleObserver')}</span>
                                        </div>
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                {role === 'operator' ? t('apiKey.roleOperatorDesc') : t('apiKey.roleObserverDesc')}
                            </p>
                        </div>

                        <div className="space-y-1.5">
                            <Label>{t('apiKey.expiryLabel')}</Label>
                            <Select value={expiry} onValueChange={setExpiry}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {EXPIRY_OPTIONS.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                            <div className="flex items-center gap-2">
                                                <span>{t(opt.labelKey)}</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {expiry === 'never' && (
                                <div className="flex items-start gap-2 text-xs text-amber-400 mt-1">
                                    <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                                    <span>{t('apiKey.permanentWarning')}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                            {t('common.cancel')}
                        </Button>
                        <Button type="submit" size="sm" disabled={loading || !name.trim()}>
                            {t('apiKey.createKey')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

function ConfirmDialog({
    open,
    onClose,
    onConfirm,
    title,
    description,
    variant = 'default',
}: {
    open: boolean
    onClose: () => void
    onConfirm: () => void
    title: string
    description: string
    variant?: 'default' | 'warning' | 'destructive'
}) {
    const {t} = useI18n()
    return (
        <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription className="text-xs">{description}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                        {t('common.cancel')}
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant={variant === 'destructive' ? 'destructive' : 'default'}
                        onClick={onConfirm}
                    >
                        {title}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
