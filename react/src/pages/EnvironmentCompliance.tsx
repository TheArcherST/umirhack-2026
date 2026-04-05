import React, { useEffect, useState } from 'react'
import axios from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import {
  History,
  ListChecks,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
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
import type {
  ComplianceCatalogItem,
  ComplianceEvent,
  ComplianceFinding,
  ComplianceMode,
  CompliancePolicy,
  TaskStreamComplianceRuleDefinition,
} from '@/api/types'
import { formatDate } from '@/lib/utils'
import { useI18n } from '@/i18n'

type TaskStreamRuleDraft = TaskStreamComplianceRuleDefinition

let draftRuleCounter = 1

function nextRuleId() {
  draftRuleCounter += 1
  return `draft-${draftRuleCounter}`
}

function newTaskStreamRule(): TaskStreamRuleDraft {
  return {
    id: nextRuleId(),
    label: '',
    task_kind: null,
    input_pattern: null,
    stdout_pattern: null,
    stderr_pattern: null,
    summary_pattern: null,
  }
}

function apiErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail
    if (typeof detail === 'string' && detail.trim()) return detail
  }
  return fallback
}

function StatCard({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: React.ElementType
  label: string
  value: number
  loading?: boolean
}) {
  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-3 rounded" />
        </div>
        <Skeleton className="h-8 w-14" />
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Icon size={13} className="text-muted-foreground/50" />
      </div>
      <p className="text-2xl font-semibold font-display tracking-tight">{value}</p>
    </div>
  )
}

function TaskStreamRuleTable({
  rules,
  onChange,
  onDelete,
  t,
}: {
  rules: TaskStreamRuleDraft[]
  onChange: (index: number, nextRule: TaskStreamRuleDraft) => void
  onDelete: (index: number) => void
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
      <table className="w-full min-w-[1180px] text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/20">
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('compliance.rule')}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('compliance.taskKind')}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('compliance.inputPattern')}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('compliance.stdoutPattern')}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('compliance.stderrPattern')}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('compliance.summaryPattern')}</th>
            <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">{t('common.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule, index) => (
            <tr key={rule.id} className="border-b border-border/40 align-top last:border-0">
              <td className="px-3 py-3">
                <Input
                  value={rule.label}
                  onChange={(e) => onChange(index, { ...rule, label: e.target.value })}
                  placeholder={t('compliance.ruleLabelPlaceholder')}
                />
              </td>
              <td className="px-3 py-3">
                <Input
                  value={rule.task_kind ?? ''}
                  onChange={(e) =>
                    onChange(index, {
                      ...rule,
                      task_kind: e.target.value.trim() || null,
                    })
                  }
                  placeholder={t('compliance.taskKindPlaceholder')}
                />
              </td>
              <td className="px-3 py-3">
                <Input
                  value={rule.input_pattern ?? ''}
                  onChange={(e) =>
                    onChange(index, {
                      ...rule,
                      input_pattern: e.target.value.trim() || null,
                    })
                  }
                  placeholder={t('compliance.inputPatternPlaceholder')}
                />
              </td>
              <td className="px-3 py-3">
                <Input
                  value={rule.stdout_pattern ?? ''}
                  onChange={(e) =>
                    onChange(index, {
                      ...rule,
                      stdout_pattern: e.target.value.trim() || null,
                    })
                  }
                  placeholder={t('compliance.stdoutPatternPlaceholder')}
                />
              </td>
              <td className="px-3 py-3">
                <Input
                  value={rule.stderr_pattern ?? ''}
                  onChange={(e) =>
                    onChange(index, {
                      ...rule,
                      stderr_pattern: e.target.value.trim() || null,
                    })
                  }
                  placeholder={t('compliance.stderrPatternPlaceholder')}
                />
              </td>
              <td className="px-3 py-3">
                <Input
                  value={rule.summary_pattern ?? ''}
                  onChange={(e) =>
                    onChange(index, {
                      ...rule,
                      summary_pattern: e.target.value.trim() || null,
                    })
                  }
                  placeholder={t('compliance.summaryPatternPlaceholder')}
                />
              </td>
              <td className="px-3 py-3 text-right">
                <Button type="button" size="sm" variant="ghost" onClick={() => onDelete(index)}>
                  <Trash2 size={12} />
                </Button>
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
  const [mode, setMode] = useState<ComplianceMode>(policy?.mode ?? 'blacklist')
  const [isEnabled, setIsEnabled] = useState(policy?.is_enabled ?? true)
  const [rules, setRules] = useState<TaskStreamRuleDraft[]>(
    policy?.definition_json.rules ?? [],
  )
  const [error, setError] = useState('')

  useEffect(() => {
    setMode(policy?.mode ?? 'blacklist')
    setIsEnabled(policy?.is_enabled ?? true)
    setRules(policy?.definition_json.rules ?? [])
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
        rules: rules.map((rule) => ({
          id: rule.id,
          label: rule.label.trim(),
          task_kind: rule.task_kind?.trim() || null,
          input_pattern: rule.input_pattern?.trim() || null,
          stdout_pattern: rule.stdout_pattern?.trim() || null,
          stderr_pattern: rule.stderr_pattern?.trim() || null,
          summary_pattern: rule.summary_pattern?.trim() || null,
        })),
      }

      if (!policy) {
        const payload: CreateCompliancePolicyPayload = {
          environment_id: envId,
          name: catalogItem.label,
          entity_kind: catalogItem.entity_kind,
          mode,
          description: catalogItem.description,
          is_enabled: isEnabled,
          definition_json,
        }
        return stubCreateCompliancePolicy(payload)
      }

      const payload: PatchCompliancePolicyPayload = {
        mode,
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

  const isSubmitDisabled = rules.length === 0 || rules.some((rule) =>
    !rule.input_pattern?.trim()
    && !rule.stdout_pattern?.trim()
    && !rule.stderr_pattern?.trim()
    && !rule.summary_pattern?.trim(),
  )

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-5 space-y-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold">{catalogItem.label}</h2>
              {policy?.revision_no != null && (
                <Badge variant="outline">r{policy.revision_no}</Badge>
              )}
              <Badge variant={isEnabled ? 'blue' : 'muted'}>
                {isEnabled ? t('compliance.enabled') : t('cron.disabled')}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground max-w-3xl">{catalogItem.description}</p>
            <p className="text-xs text-muted-foreground">{t('compliance.rulesHint')}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-[190px] space-y-1">
              <Label>{t('compliance.mode')}</Label>
              <Select value={mode} onValueChange={(value) => setMode(value as ComplianceMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="blacklist">{t('compliance.modes.blacklist')}</SelectItem>
                  <SelectItem value="allowlist">{t('compliance.modes.allowlist')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Checkbox
                id="task-stream-enabled"
                checked={isEnabled}
                onCheckedChange={(value) => setIsEnabled(value === true)}
              />
              <label htmlFor="task-stream-enabled" className="text-xs cursor-pointer">
                {t('compliance.enabled')}
              </label>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Button type="button" size="sm" onClick={() => setRules((prev) => [...prev, newTaskStreamRule()])}>
                <Plus size={13} className="mr-1.5" />
                {t('compliance.addRule')}
              </Button>
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
        </div>

        <TaskStreamRuleTable
          rules={rules}
          onChange={(index, nextRule) =>
            setRules((prev) =>
              prev.map((item, itemIndex) => (itemIndex === index ? nextRule : item)),
            )
          }
          onDelete={(index) =>
            setRules((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
          }
          t={t}
        />

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
                    {t('compliance.matchedRules')}
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
                          <span className="text-[11px] text-muted-foreground">{t('compliance.noMatchedRule')}</span>
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
  const { data: policies = [], isLoading: loadingPolicies } = useQuery({
    queryKey: ['compliance-policies', envId],
    queryFn: () => stubGetCompliancePolicies(envId!),
    enabled: !!envId,
  })
  const { data: findings = [], isLoading: loadingFindings } = useQuery({
    queryKey: ['compliance-findings', envId],
    queryFn: () => stubGetComplianceFindings(envId!),
    refetchInterval: 15_000,
    enabled: !!envId,
  })
  const { data: events = [], isLoading: loadingEvents } = useQuery({
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              icon={ShieldCheck}
              label={t('compliance.policyCount')}
              value={policies.length}
              loading={loadingPolicies}
            />
            <StatCard
              icon={TriangleAlert}
              label={t('compliance.openViolations')}
              value={findings.length}
              loading={loadingFindings}
            />
            <StatCard
              icon={ListChecks}
              label={t('compliance.allowlists')}
              value={policies.filter((item) => item.mode === 'allowlist').length}
              loading={loadingPolicies}
            />
            <StatCard
              icon={History}
              label={t('compliance.recentEvents')}
              value={events.length}
              loading={loadingEvents}
            />
          </div>

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
