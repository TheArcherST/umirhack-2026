import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import {
  History,
  Plus,
  ShieldAlert,
  Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EnvironmentHeader } from '@/components/EnvironmentHeader'
import {
  stubCreateCompliancePolicy,
  stubDeleteCompliancePolicy,
  stubGetComplianceCatalog,
  stubGetComplianceEvents,
  stubGetComplianceFindings,
  stubGetCompliancePolicies,
  type CreateCompliancePolicyPayload,
  type PatchCompliancePolicyPayload,
  stubPatchCompliancePolicy,
} from '@/api/stubs'
import { TASK_TEMPLATES } from '@/api/types'
import type {
  ComplianceCatalogItem,
  ComplianceEvent,
  ComplianceFinding,
  CompliancePolicy,
  TaskStreamComplianceDefinition,
  TaskTemplate,
  TaskStreamComplianceRuleDefinition,
} from '@/api/types'
import { cn, formatDate } from '@/lib/utils'
import { useI18n } from '@/i18n'

type TaskStreamRuleDraft = TaskStreamComplianceRuleDefinition

const ANY_TASK_KIND = '__any__'

let draftRuleCounter = 1

function nextRuleId() {
  draftRuleCounter += 1
  return `draft-${draftRuleCounter}`
}

const TASK_KIND_BY_TEMPLATE: Record<TaskTemplate, string> = {
  ping: 'network.endpoint_connectivity',
  system_info: 'host.system_profile',
  network_interfaces: 'host.ip_interfaces',
  self_update: 'agent.self_update',
  custom_command: 'diagnostic.command.custom',
  port_scan: 'diagnostic.command.port_scan',
  disk_usage: 'diagnostic.command.disk_usage',
  memory_cpu: 'diagnostic.command.memory_cpu',
  service_status: 'diagnostic.command.service_status',
  system_logs: 'diagnostic.command.system_logs',
}

function newTaskStreamRule(): TaskStreamRuleDraft {
  return {
    id: nextRuleId(),
    label: '',
    window_minutes: 60,
    task_kind: 'diagnostic.command.custom',
    input_pattern: null,
    input_negated: false,
    stdout_pattern: null,
    stdout_negated: false,
    stderr_pattern: null,
    stderr_negated: false,
  }
}

function hydrateRuleDraft(rule: Partial<TaskStreamRuleDraft>): TaskStreamRuleDraft {
  return {
    id: String(rule.id || nextRuleId()),
    label: String(rule.label || ''),
    window_minutes: typeof rule.window_minutes === 'number' && Number.isFinite(rule.window_minutes) && rule.window_minutes > 0
      ? Math.floor(rule.window_minutes)
      : 60,
    task_kind: typeof rule.task_kind === 'string' && rule.task_kind.trim()
      ? rule.task_kind.trim()
      : null,
    input_pattern: typeof rule.input_pattern === 'string' && rule.input_pattern.trim()
      ? rule.input_pattern.trim()
      : null,
    input_negated: Boolean(rule.input_negated),
    stdout_pattern: typeof rule.stdout_pattern === 'string' && rule.stdout_pattern.trim()
      ? rule.stdout_pattern.trim()
      : null,
    stdout_negated: Boolean(rule.stdout_negated),
    stderr_pattern: typeof rule.stderr_pattern === 'string' && rule.stderr_pattern.trim()
      ? rule.stderr_pattern.trim()
      : null,
    stderr_negated: Boolean(rule.stderr_negated),
  }
}

function extractRuleGroups(
  definition: TaskStreamComplianceDefinition | undefined | null,
): {
  requirements: TaskStreamRuleDraft[]
  forbids: TaskStreamRuleDraft[]
} {
  const requirements = Array.isArray(definition?.requirements)
    ? definition.requirements.map(hydrateRuleDraft)
    : []
  const forbids = Array.isArray(definition?.forbids)
    ? definition.forbids.map(hydrateRuleDraft)
    : []

  if (requirements.length > 0 || forbids.length > 0) {
    return { requirements, forbids }
  }

  return {
    requirements: [],
    forbids: Array.isArray(definition?.rules)
      ? definition.rules.map(hydrateRuleDraft)
      : [],
  }
}

function apiErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail
    if (typeof detail === 'string' && detail.trim()) return detail
  }
  return fallback
}

function RegexPatternInput({
  value,
  negated,
  placeholder,
  onChange,
  onToggle,
  t,
}: {
  value: string | null
  negated: boolean
  placeholder: string
  onChange: (value: string | null) => void
  onToggle: () => void
  t: (key: string) => string
}) {
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={cn(
          'h-9 w-6 px-0 shrink-0 font-mono text-sm',
          negated
            ? 'border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15'
            : 'text-muted-foreground/40 hover:text-muted-foreground',
        )}
        title={t(negated ? 'compliance.negationEnabled' : 'compliance.negationDisabled')}
        onClick={onToggle}
      >
        !
      </Button>
      <Input
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        placeholder={placeholder}
      />
    </div>
  )
}

function TaskStreamRuleTable({
  rules,
  onChange,
  onDeleteRequest,
  t,
}: {
  rules: TaskStreamRuleDraft[]
  onChange: (index: number, nextRule: TaskStreamRuleDraft) => void
  onDeleteRequest: (index: number) => void
  t: (key: string) => string
}) {
  if (rules.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground">
        {t('compliance.noRulesConfigured')}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full min-w-[1040px] text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/20">
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('compliance.name')}</th>
            <th className="w-20 px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('compliance.windowMinutes')}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('compliance.taskKind')}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('compliance.inputPattern')}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('compliance.stdoutPattern')}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('compliance.stderrPattern')}</th>
            <th className="w-10 px-3 py-2 text-right text-xs font-medium text-muted-foreground">{t('common.delete')}</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule, index) => (
            <tr key={rule.id} className="border-b border-border/40 align-top last:border-0">
              <td className="px-3 py-3">
                <Input
                  value={rule.label}
                  onChange={(e) => onChange(index, { ...rule, label: e.target.value })}
                  placeholder={t('compliance.namePlaceholder')}
                />
              </td>
              <td className="w-20 px-3 py-3">
                <Input
                  type="number"
                  min={1}
                  max={999}
                  step={1}
                  value={rule.window_minutes}
                  className="w-16 min-w-0 font-mono text-xs"
                  onChange={(e) =>
                    onChange(index, {
                      ...rule,
                      window_minutes: Math.min(999, Math.max(1, Number.parseInt(e.target.value || '1', 10) || 1)),
                    })
                  }
                  placeholder={t('compliance.windowMinutesPlaceholder')}
                />
              </td>
              <td className="px-3 py-3">
                <Select
                  value={rule.task_kind ?? ANY_TASK_KIND}
                  onValueChange={(value) =>
                    onChange(index, {
                      ...rule,
                      task_kind: value === ANY_TASK_KIND ? null : value,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY_TASK_KIND}>{t('compliance.anyTaskKind')}</SelectItem>
                    {TASK_TEMPLATES.map((template) => (
                      <SelectItem key={template.id} value={TASK_KIND_BY_TEMPLATE[template.id]}>
                        {t(template.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </td>
              <td className="px-3 py-3">
                <RegexPatternInput
                  value={rule.input_pattern ?? ''}
                  negated={rule.input_negated}
                  onChange={(value) =>
                    onChange(index, {
                      ...rule,
                      input_pattern: value,
                    })
                  }
                  onToggle={() =>
                    onChange(index, {
                      ...rule,
                      input_negated: !rule.input_negated,
                    })
                  }
                  placeholder={t('compliance.inputPatternPlaceholder')}
                  t={t}
                />
              </td>
              <td className="px-3 py-3">
                <RegexPatternInput
                  value={rule.stdout_pattern ?? ''}
                  negated={rule.stdout_negated}
                  onChange={(value) =>
                    onChange(index, {
                      ...rule,
                      stdout_pattern: value,
                    })
                  }
                  onToggle={() =>
                    onChange(index, {
                      ...rule,
                      stdout_negated: !rule.stdout_negated,
                    })
                  }
                  placeholder={t('compliance.stdoutPatternPlaceholder')}
                  t={t}
                />
              </td>
              <td className="px-3 py-3">
                <RegexPatternInput
                  value={rule.stderr_pattern ?? ''}
                  negated={rule.stderr_negated}
                  onChange={(value) =>
                    onChange(index, {
                      ...rule,
                      stderr_pattern: value,
                    })
                  }
                  onToggle={() =>
                    onChange(index, {
                      ...rule,
                      stderr_negated: !rule.stderr_negated,
                    })
                  }
                  placeholder={t('compliance.stderrPatternPlaceholder')}
                  t={t}
                />
              </td>
              <td className="w-10 px-3 py-3">
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => onDeleteRequest(index)}
                    className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-accent transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CompliancePanel({
  envId,
  catalogItem,
  policy,
  findings,
  events,
}: {
  envId: string
  catalogItem: ComplianceCatalogItem
  policy: CompliancePolicy | null
  findings: ComplianceFinding[]
  events: ComplianceEvent[]
}) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [isEnabled, setIsEnabled] = useState(policy?.is_enabled ?? true)
  const [requirements, setRequirements] = useState<TaskStreamRuleDraft[]>(
    extractRuleGroups(policy?.definition_json).requirements,
  )
  const [forbids, setForbids] = useState<TaskStreamRuleDraft[]>(
    extractRuleGroups(policy?.definition_json).forbids,
  )
  const [deleteTarget, setDeleteTarget] = useState<{ group: 'requirements' | 'forbids'; index: number } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const groups = extractRuleGroups(policy?.definition_json)
    setIsEnabled(policy?.is_enabled ?? true)
    setRequirements(groups.requirements)
    setForbids(groups.forbids)
    setDeleteTarget(null)
    setError('')
  }, [policy])

  const invalidateCompliance = () => {
    queryClient.invalidateQueries({ queryKey: ['compliance-policies', envId] })
    queryClient.invalidateQueries({ queryKey: ['compliance-findings', envId] })
    queryClient.invalidateQueries({ queryKey: ['compliance-events', envId] })
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const definition_json = {
        requirements: requirements.map((rule) => ({
          id: rule.id,
          label: rule.label.trim(),
          window_minutes: Math.max(1, Math.floor(rule.window_minutes || 60)),
          task_kind: rule.task_kind?.trim() || null,
          input_pattern: rule.input_pattern === '' ? null : rule.input_pattern,
          input_negated: Boolean(rule.input_negated),
          stdout_pattern: rule.stdout_pattern === '' ? null : rule.stdout_pattern,
          stdout_negated: Boolean(rule.stdout_negated),
          stderr_pattern: rule.stderr_pattern === '' ? null : rule.stderr_pattern,
          stderr_negated: Boolean(rule.stderr_negated),
        })),
        forbids: forbids.map((rule) => ({
          id: rule.id,
          label: rule.label.trim(),
          window_minutes: Math.max(1, Math.floor(rule.window_minutes || 60)),
          task_kind: rule.task_kind?.trim() || null,
          input_pattern: rule.input_pattern === '' ? null : rule.input_pattern,
          input_negated: Boolean(rule.input_negated),
          stdout_pattern: rule.stdout_pattern === '' ? null : rule.stdout_pattern,
          stdout_negated: Boolean(rule.stdout_negated),
          stderr_pattern: rule.stderr_pattern === '' ? null : rule.stderr_pattern,
          stderr_negated: Boolean(rule.stderr_negated),
        })),
      }

      if (!policy) {
        const payload: CreateCompliancePolicyPayload = {
          environment_id: envId,
          name: catalogItem.label,
          entity_kind: catalogItem.entity_kind,
          mode: 'blacklist',
          description: catalogItem.description,
          is_enabled: isEnabled,
          definition_json,
        }
        return stubCreateCompliancePolicy(payload)
      }

      const payload: PatchCompliancePolicyPayload = {
        is_enabled: isEnabled,
        definition_json,
      }
      return stubPatchCompliancePolicy(policy.id, payload)
    },
    onSuccess: () => {
      invalidateCompliance()
    },
    onError: (mutationError) => {
      setError(apiErrorMessage(mutationError, t('compliance.saveFailed')))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!policy) return
      await stubDeleteCompliancePolicy(policy.id)
    },
    onSuccess: () => {
      invalidateCompliance()
    },
    onError: (mutationError) => {
      setError(apiErrorMessage(mutationError, t('compliance.saveFailed')))
    },
  })

  const allRules = [...requirements, ...forbids]
  const isSubmitDisabled = allRules.length === 0 || allRules.some((rule) =>
    !rule.input_pattern
    && !rule.stdout_pattern
    && !rule.stderr_pattern
  )

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-5 space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-semibold">{t('compliance.rules')}</h2>
            {policy?.revision_no != null && (
              <Badge variant="outline">r{policy.revision_no}</Badge>
            )}
            <Badge variant={isEnabled ? 'blue' : 'muted'}>
              {isEnabled ? t('compliance.enabled') : t('cron.disabled')}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 pr-2">
              <Checkbox
                id="task-stream-enabled"
                checked={isEnabled}
                onCheckedChange={(value) => setIsEnabled(value === true)}
              />
              <label htmlFor="task-stream-enabled" className="text-xs cursor-pointer">
                {t('compliance.enabled')}
              </label>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || isSubmitDisabled}
            >
              {t('compliance.saveRuleSet')}
            </Button>
            {policy && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (window.confirm(t('compliance.deleteRuleSetConfirm'))) {
                    deleteMutation.mutate()
                  }
                }}
                disabled={deleteMutation.isPending}
              >
                <Trash2 size={12} className="mr-1.5" />
                {t('compliance.deleteRuleSet')}
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">{t('compliance.requirements')}</h3>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setRequirements((prev) => [...prev, newTaskStreamRule()])}
              >
                <Plus size={13} className="mr-1.5" />
                {t('compliance.addRequirement')}
              </Button>
            </div>
            <TaskStreamRuleTable
              rules={requirements}
              onChange={(index, nextRule) =>
                setRequirements((prev) =>
                  prev.map((item, itemIndex) => (itemIndex === index ? nextRule : item)),
                )
              }
              onDeleteRequest={(index) => setDeleteTarget({ group: 'requirements', index })}
              t={t}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">{t('compliance.forbids')}</h3>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setForbids((prev) => [...prev, newTaskStreamRule()])}
              >
                <Plus size={13} className="mr-1.5" />
                {t('compliance.addForbid')}
              </Button>
            </div>
            <TaskStreamRuleTable
              rules={forbids}
              onChange={(index, nextRule) =>
                setForbids((prev) =>
                  prev.map((item, itemIndex) => (itemIndex === index ? nextRule : item)),
                )
              }
              onDeleteRequest={(index) => setDeleteTarget({ group: 'forbids', index })}
              t={t}
            />
          </div>
        </div>

        {error && (
          <p className="text-xs text-destructive font-mono">{error}</p>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border/60 flex items-center gap-2">
            <ShieldAlert size={13} className="text-muted-foreground" />
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t('compliance.activeViolations')}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">
                    {t('compliance.subject')}
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">
                    {t('compliance.violatedRules')}
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">
                    {t('dashboard.time')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {findings.map((finding) => (
                  <tr key={`${finding.policy_id}:${finding.subject_key}`} className="border-b border-border/40 last:border-0">
                    <td className="px-4 py-3 align-top">
                      <p className="text-xs font-mono">{finding.subject_label}</p>
                      {finding.host_name && (
                        <p className="text-[11px] text-muted-foreground mt-1">{finding.host_name}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-wrap gap-1">
                        {finding.matched_rule_labels.map((label) => (
                          <Badge key={label} variant="outline" className="text-[10px]">
                            {label}
                          </Badge>
                        ))}
                        {finding.matched_rule_labels.length === 0 && (
                          <span className="text-[11px] text-muted-foreground">{t('compliance.noViolatedRule')}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(finding.observed_at)}
                    </td>
                  </tr>
                ))}
                {findings.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-xs text-muted-foreground">
                      {t('compliance.noViolations')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border/60 flex items-center gap-2">
            <History size={13} className="text-muted-foreground" />
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t('compliance.events')}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">
                    {t('common.status')}
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">
                    {t('compliance.origin')}
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">
                    {t('compliance.subject')}
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">
                    {t('dashboard.time')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id} className="border-b border-border/40 last:border-0">
                    <td className="px-4 py-3">
                      <Badge variant={event.event_kind === 'rise' ? 'destructive' : 'success'}>
                        {t(`compliance.eventKinds.${event.event_kind}`)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={event.event_origin === 'live' ? 'blue' : 'outline'}>
                        {t(`compliance.eventOrigins.${event.event_origin}`)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-mono">{event.subject_label}</p>
                      {event.host_name && (
                        <p className="text-[11px] text-muted-foreground mt-1">{event.host_name}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(event.happened_at)}
                    </td>
                  </tr>
                ))}
                {events.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-xs text-muted-foreground">
                      {t('compliance.noEvents')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={(value) => { if (!value) setDeleteTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('compliance.deleteRuleConfirmTitle')}</DialogTitle>
          </DialogHeader>
          <p className="px-6 text-xs text-muted-foreground">{t('compliance.deleteRuleConfirmBody')}</p>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (!deleteTarget) return
                if (deleteTarget.group === 'requirements') {
                  setRequirements((prev) => prev.filter((_, itemIndex) => itemIndex !== deleteTarget.index))
                } else {
                  setForbids((prev) => prev.filter((_, itemIndex) => itemIndex !== deleteTarget.index))
                }
                setDeleteTarget(null)
              }}
            >
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function EnvironmentCompliance() {
  const { envId } = useParams<{ envId: string }>()
  const { t } = useI18n()

  const { data: catalog = [] } = useQuery({
    queryKey: ['compliance-catalog'],
    queryFn: () => stubGetComplianceCatalog(),
  })
  const { data: policies = [] } = useQuery({
    queryKey: ['compliance-policies', envId],
    queryFn: () => stubGetCompliancePolicies(envId!),
    enabled: !!envId,
  })
  const { data: findings = [] } = useQuery({
    queryKey: ['compliance-findings', envId],
    queryFn: () => stubGetComplianceFindings(envId!),
    refetchInterval: 15_000,
    enabled: !!envId,
  })
  const { data: events = [] } = useQuery({
    queryKey: ['compliance-events', envId],
    queryFn: () => stubGetComplianceEvents(envId!),
    refetchInterval: 15_000,
    enabled: !!envId,
  })

  const catalogItem = catalog[0] ?? null
  const policy = catalogItem
    ? policies.find((item) => item.entity_kind === catalogItem.entity_kind) ?? null
    : null
  const visibleFindings = catalogItem
    ? findings.filter((item) => item.entity_kind === catalogItem.entity_kind)
    : []
  const visibleEvents = catalogItem
    ? events.filter((item) => item.entity_kind === catalogItem.entity_kind)
    : []

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <EnvironmentHeader envId={envId!} title={t('compliance.title')} />

      <div className="flex-1 overflow-y-auto">
        <div className="p-5 space-y-6">
          {catalogItem && envId ? (
            <CompliancePanel
              envId={envId}
              catalogItem={catalogItem}
              policy={policy}
              findings={visibleFindings}
              events={visibleEvents}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-card px-4 py-8 text-sm text-muted-foreground">
              {t('compliance.noPolicies')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
