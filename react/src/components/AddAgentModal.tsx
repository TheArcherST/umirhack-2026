import React, {useState, useEffect} from 'react'
import {X, CheckCircle2, Copy, Loader2} from 'lucide-react'
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {MultiEnvSelect} from '@/components/ui/multi-env-select'
import {stubCreateAgent, stubGetEnvironments} from '@/api/stubs'
import type {AgentOS, InstallScript} from '@/api/types'
import {useI18n} from '@/i18n'
import {useProject} from '@/hooks/useProject'
import {cn, copyText} from '@/lib/utils'

interface Props {
    open: boolean
    onClose: () => void
    onCreated: () => void
}

const OS_OPTIONS: { value: AgentOS; label: string }[] = [
    {value: 'linux', label: 'Linux'},
    {value: 'windows', label: 'Windows'},
    {value: 'macos', label: 'macOS'},
]

export function AddAgentModal({open, onClose, onCreated}: Props) {
    const {t} = useI18n()
    const {currentProject, environments} = useProject()
    const [name, setName] = useState('')
    const [os, setOs] = useState<AgentOS>('linux')
    const [selectedEnvs, setSelectedEnvs] = useState<string[]>([])
    const [safeInstall, setSafeInstall] = useState(false)
    const [maxConcurrentTasks, setMaxConcurrentTasks] = useState('4')
    const [agentVersion, setAgentVersion] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const [step, setStep] = useState<'form' | 'script'>('form')
    const [installScript, setInstallScript] = useState<InstallScript | null>(null)
    const [copied, setCopied] = useState(false)

    // Default: only "main" env selected
    useEffect(() => {
        if (open && environments.length > 0) {
            const mainEnv = environments.find((e) => e.name === 'main')
            setSelectedEnvs(mainEnv ? [mainEnv.id] : [environments[0].id])
        } else if (open) {
            setSelectedEnvs([])
        }
    }, [open, environments])

    useEffect(() => {
        if (open && currentProject?.id) {
            stubGetEnvironments(currentProject.id)
        }
    }, [open, currentProject])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!name.trim()) return
        setError('')
        setLoading(true)
        try {
            const parsedLimit = Number.parseInt(maxConcurrentTasks, 10)
            const result = await stubCreateAgent({
                name: name.trim(),
                os,
                safe_install: safeInstall,
                max_concurrent_tasks: Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 4,
                agent_version: agentVersion.trim() || undefined,
                environment_ids: selectedEnvs,
            })
            setInstallScript(result.installScript)
            setStep('script')
            onCreated()
        } catch (err: any) {
            setError(err.message ?? t('agent.addAgent'))
        } finally {
            setLoading(false)
        }
    }

    const copyScript = async () => {
        if (!installScript) return
        const copiedOk = await copyText(installScript.command)
        if (!copiedOk) {
            setError(t('agent.copyFailed'))
            return
        }
        setError('')
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const handleClose = () => {
        setName('')
        setOs('linux')
        setSelectedEnvs([])
        setSafeInstall(false)
        setMaxConcurrentTasks('4')
        setAgentVersion('')
        setError('')
        setStep('form')
        setInstallScript(null)
        setCopied(false)
        onClose()
    }

    const installHint =
        installScript?.platform === 'windows'
            ? 'Windows PowerShell (run as Administrator)'
            : installScript?.platform === 'macos'
                ? 'macOS shell (run with sudo/root)'
                : 'Linux shell (run with sudo/root)'

    return (
        <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
            <DialogContent className={cn(step === 'script' ? 'max-w-lg' : '')}>
                <DialogHeader>
                    <DialogTitle>
                        {step === 'form' ? t('agent.addAgent') : t('agent.installScriptTitle')}
                    </DialogTitle>
                </DialogHeader>

                {step === 'form' ? (
                    <form onSubmit={handleSubmit}>
                        <div className="px-6 pb-2 space-y-4">
                            <div className="space-y-1.5">
                                <Label>{t('agent.agentName')}</Label>
                                <Input
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder={t('agent.agentNamePlaceholder')}
                                    autoFocus
                                    required
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label>{t('agent.operatingSystem')}</Label>
                                <Select value={os} onValueChange={(v) => setOs(v as AgentOS)}>
                                    <SelectTrigger>
                                        <SelectValue/>
                                    </SelectTrigger>
                                    <SelectContent>
                                        {OS_OPTIONS.map((opt) => (
                                            <SelectItem
                                                key={opt.value}
                                                value={opt.value}
                                            >
                                                {opt.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <Label>{t('agent.environments')}</Label>
                                <MultiEnvSelect
                                    environments={environments}
                                    value={selectedEnvs}
                                    onChange={setSelectedEnvs}
                                    placeholder={t('agent.selectEnvPlaceholder')}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label>{t('agent.maxConcurrentTasks')}</Label>
                                <Input
                                    type="number"
                                    min={1}
                                    max={128}
                                    value={maxConcurrentTasks}
                                    onChange={(e) => setMaxConcurrentTasks(e.target.value)}
                                />
                                <p className="text-[11px] text-muted-foreground">
                                    {t('agent.maxConcurrentTasksHint')}
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <Label>{t('agent.version')}</Label>
                                <Input
                                    value={agentVersion}
                                    onChange={(e) => setAgentVersion(e.target.value)}
                                    placeholder={t('agent.versionPlaceholder')}
                                    className="font-mono text-xs"
                                />
                                <p className="text-[11px] text-muted-foreground">
                                    {t('agent.versionHint')}
                                </p>
                            </div>

                            <label className="flex items-start gap-3 rounded-md border border-border px-3 py-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={safeInstall}
                                    onChange={(e) => setSafeInstall(e.target.checked)}
                                    className="mt-0.5"
                                />
                                <span className="space-y-1">
                                    <span className="block font-medium">{t('agent.safeInstall')}</span>
                                    <span className="block text-xs text-muted-foreground">
                                        {t('agent.safeInstallHint')}
                                    </span>
                                </span>
                            </label>

                            {error && <p className="text-xs text-red-400 font-mono">{error}</p>}
                        </div>

                        <div className="flex justify-end gap-2 px-6 pb-2">
                            <Button type="button" variant="ghost" size="sm" onClick={handleClose}>
                                {t('common.cancel')}
                            </Button>
                            <Button
                                type="submit"
                                size="sm"
                                disabled={loading || !name.trim()}
                            >
                                {loading ? <Loader2 size={13} className="animate-spin"/> : t('agent.addAgent')}
                            </Button>
                        </div>
                    </form>
                ) : (
                    <div className="px-6 pb-4 space-y-3">
                        <p className="text-xs text-muted-foreground">{t('agent.installScript')}</p>
                        <p className="text-[11px] text-muted-foreground font-mono">
                            {installHint}
                        </p>
                        <p className="text-[11px] text-muted-foreground font-mono">
                            {t('agent.installVersion')}: {installScript?.version}
                        </p>
                        {installScript?.safe_install && (
                            <p className="text-[11px] text-amber-500 font-mono">
                                {t('agent.safeInstallEnabled')}
                            </p>
                        )}
                        <div className="relative rounded-md border border-border bg-muted/30 overflow-hidden">
                            <div className="absolute top-2 right-2 z-10">
                                <button
                                    onClick={copyScript}
                                    className="p-1.5 rounded bg-card/80 border border-border text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    {copied ? <CheckCircle2 size={13} className="text-green-400"/> : <Copy size={13}/>}
                                </button>
                            </div>
                            <pre
                                className="p-4 text-xs font-mono leading-relaxed overflow-x-auto max-h-40 overflow-y-auto text-foreground/80 whitespace-pre-wrap break-all select-all">
                {installScript?.command ?? ''}
              </pre>
                        </div>
                        <p className="text-xs text-green-400 font-mono">✓ {t('agent.agentAdded')}</p>
                        <div className="flex justify-end">
                            <Button size="sm" onClick={handleClose}>{t('common.close')}</Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
