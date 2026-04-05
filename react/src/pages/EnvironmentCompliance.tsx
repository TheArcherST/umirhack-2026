import React, { useMemo, useState } from 'react'
import axios from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import {
  History,
  ListChecks,
  Pencil,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  TriangleAlert,
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
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { EnvironmentHeader } from '@/components/EnvironmentHeader'
import {
  stubCreateCompliancePolicy,
  stubDeleteCompliancePolicy,
  stubGetComplianceCatalog,
  stubGetComplianceEvents,
  stubGetComplianceFindings,
  stubGetCompliancePolicies,
  stubGetHosts,
  stubPatchCompliancePolicy,
  type CreateCompliancePolicyPayload,
  type PatchCompliancePolicyPayload,
} from '@/api/stubs'
import type {
  ComplianceCatalogItem,
  ComplianceEntityKind,
  ComplianceEvent,
  ComplianceFinding,
  ComplianceMode,
  CompliancePolicy,
  EndpointComplianceRuleDefinition,
  Host,
  ServiceComplianceRuleDefinition,
} from '@/api/types'
import { cn, formatDate } from '@/lib/utils'
import { useI18n } from '@/i18n'

type EndpointRuleDraft = EndpointComplianceRuleDefinition & {
  target_mode: 'any' | 'hosts' | 'endpoint'
}

type ServiceRuleDraft = ServiceComplianceRuleDefinition

let draftRuleCounter = 1

function nextRuleId() {
  draftRuleCounter += 1
  return `draft-${draftRuleCounter}`
}

function newEndpointRule(): EndpointRuleDraft {
  return {
    id: nextRuleId(),
    label: '',
    source_host_ids: [],
    target_host_ids: [],
    target_endpoint: null,
    target_mode: 'any',
    connectivity: 'reachable',
    max_latency_ms: null,
  }
}

function newServiceRule(): ServiceRuleDraft {
  return {
    id: nextRuleId(),
    label: '',
    host_ids: [],
    service_name: '',
    status: 'running',
  }
}

function mapEndpointRuleToDraft(
  rule: EndpointComplianceRuleDefinition,
): EndpointRuleDraft {
  return {
    ...rule,
    target_mode: rule.target_host_ids.length > 0
      ? 'hosts'
      : rule.target_endpoint
        ? 'endpoint'
        : 'any',
  }
}

function mapDraftToEndpointRule(
  rule: EndpointRuleDraft,
): EndpointComplianceRuleDefinition {
  return {
    id: rule.id,
    label: rule.label.trim(),
    source_host_ids: rule.source_host_ids,
    target_host_ids: rule.target_mode === 'hosts' ? rule.target_host_ids : [],
    target_endpoint: rule.target_mode === 'endpoint'
      ? (rule.target_endpoint?.trim() || null)
      : null,
    connectivity: rule.connectivity,
    max_latency_ms: rule.max_latency_ms,
  }
}

function isEndpointPolicy(policy: CompliancePolicy) {
  return policy.entity_kind === 'endpoint_connectivity'
}

function describePolicyRule(
  policy: CompliancePolicy,
  rule: EndpointComplianceRuleDefinition | ServiceComplianceRuleDefinition,
  hostNameById: Map<string, string>,
  t: (key: string) => string,
): string {
  if (policy.entity_kind === 'endpoint_connectivity') {
    const endpointRule = rule as EndpointComplianceRuleDefinition
    const source = endpointRule.source_host_ids.length > 0
      ? endpointRule.source_host_ids
        .map((id) => hostNameById.get(id) ?? id)
        .join(', ')
      : t('compliance.anySource')
    const target = endpointRule.target_host_ids.length > 0
      ? endpointRule.target_host_ids
        .map((id) => hostNameById.get(id) ?? id)
        .join(', ')
      : endpointRule.target_endpoint || t('compliance.anyTarget')
    const parts = [
      `${source} -> ${target}`,
      endpointRule.connectivity !== 'any'
        ? t(`compliance.connectivity.${endpointRule.connectivity}`)
        : t('compliance.anyState'),
    ]
    if (endpointRule.max_latency_ms != null) {
      parts.push(`<= ${endpointRule.max_latency_ms} ms`)
    }
    return parts.join(' · ')
  }

  const serviceRule = rule as ServiceComplianceRuleDefinition
  const scope = serviceRule.host_ids.length > 0
    ? serviceRule.host_ids.map((id) => hostNameById.get(id) ?? id).join(', ')
    : t('compliance.anyHost')
  const status = serviceRule.status === 'any'
    ? t('compliance.anyState')
    : t(`compliance.serviceStatus.${serviceRule.status}`)
  return `${scope} · ${serviceRule.service_name} · ${status}`
}

function policyTypeLabel(
  catalog: ComplianceCatalogItem[],
  entityKind: ComplianceEntityKind,
) {
  return catalog.find((item) => item.entity_kind === entityKind)?.label ?? entityKind
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

function HostSelector({
  hosts,
  selectedIds,
  onToggle,
}: {
  hosts: Host[]
  selectedIds: string[]
  onToggle: (id: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {hosts.map((host) => (
        <button
          key={host.id}
          type="button"
          onClick={() => onToggle(host.id)}
          className={cn(
            'px-2.5 py-1 rounded-md text-[10px] font-mono border transition-colors',
            selectedIds.includes(host.id)
              ? 'bg-accent border-accent-foreground/20 text-foreground'
              : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent/50',
          )}
        >
          {host.name}
        </button>
      ))}
    </div>
  )
}

function EndpointRuleEditor({
  rule,
  hosts,
  onChange,
  onDelete,
  t,
}: {
  rule: EndpointRuleDraft
  hosts: Host[]
  onChange: (nextRule: EndpointRuleDraft) => void
  onDelete: () => void
  t: (key: string) => string
}) {
  const toggleSourceHost = (hostId: string) => {
    onChange({
      ...rule,
      source_host_ids: rule.source_host_ids.includes(hostId)
        ? rule.source_host_ids.filter((id) => id !== hostId)
        : [...rule.source_host_ids, hostId],
    })
  }

  const toggleTargetHost = (hostId: string) => {
    onChange({
      ...rule,
      target_host_ids: rule.target_host_ids.includes(hostId)
        ? rule.target_host_ids.filter((id) => id !== hostId)
        : [...rule.target_host_ids, hostId],
    })
  }

  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 space-y-1.5">
          <Label>{t('compliance.ruleLabel')}</Label>
          <Input
            value={rule.label}
            onChange={(e) => onChange({ ...rule, label: e.target.value })}
            placeholder={t('compliance.ruleLabelPlaceholder')}
          />
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={onDelete}>
          <Trash2 size={12} />
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label>{t('compliance.sourceHosts')}</Label>
        <HostSelector
          hosts={hosts}
          selectedIds={rule.source_host_ids}
          onToggle={toggleSourceHost}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>{t('compliance.targetMode')}</Label>
          <Select
            value={rule.target_mode}
            onValueChange={(value) =>
              onChange({
                ...rule,
                target_mode: value as EndpointRuleDraft['target_mode'],
                target_host_ids: value === 'hosts' ? rule.target_host_ids : [],
                target_endpoint: value === 'endpoint' ? rule.target_endpoint : null,
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">{t('compliance.targetModes.any')}</SelectItem>
              <SelectItem value="hosts">{t('compliance.targetModes.hosts')}</SelectItem>
              <SelectItem value="endpoint">{t('compliance.targetModes.endpoint')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>{t('compliance.expectedConnectivity')}</Label>
          <Select
            value={rule.connectivity}
            onValueChange={(value) =>
              onChange({
                ...rule,
                connectivity: value as EndpointRuleDraft['connectivity'],
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">{t('compliance.anyState')}</SelectItem>
              <SelectItem value="reachable">{t('compliance.connectivity.reachable')}</SelectItem>
              <SelectItem value="unreachable">{t('compliance.connectivity.unreachable')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {rule.target_mode === 'hosts' && (
        <div className="space-y-1.5">
          <Label>{t('compliance.targetHosts')}</Label>
          <HostSelector
            hosts={hosts}
            selectedIds={rule.target_host_ids}
            onToggle={toggleTargetHost}
          />
        </div>
      )}

      {rule.target_mode === 'endpoint' && (
        <div className="space-y-1.5">
          <Label>{t('compliance.targetEndpoint')}</Label>
          <Input
            value={rule.target_endpoint ?? ''}
            onChange={(e) =>
              onChange({
                ...rule,
                target_endpoint: e.target.value,
              })
            }
            placeholder={t('compliance.targetEndpointPlaceholder')}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label>{t('compliance.maxLatency')}</Label>
        <Input
          type="number"
          min="0"
          value={rule.max_latency_ms ?? ''}
          onChange={(e) =>
            onChange({
              ...rule,
              max_latency_ms: e.target.value === '' ? null : Number(e.target.value),
            })
          }
          placeholder="50"
        />
      </div>
    </div>
  )
}

function ServiceRuleEditor({
  rule,
  hosts,
  onChange,
  onDelete,
  t,
}: {
  rule: ServiceRuleDraft
  hosts: Host[]
  onChange: (nextRule: ServiceRuleDraft) => void
  onDelete: () => void
  t: (key: string) => string
}) {
  const toggleHost = (hostId: string) => {
    onChange({
      ...rule,
      host_ids: rule.host_ids.includes(hostId)
        ? rule.host_ids.filter((id) => id !== hostId)
        : [...rule.host_ids, hostId],
    })
  }

  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 space-y-1.5">
          <Label>{t('compliance.ruleLabel')}</Label>
          <Input
            value={rule.label}
            onChange={(e) => onChange({ ...rule, label: e.target.value })}
            placeholder={t('compliance.ruleLabelPlaceholder')}
          />
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={onDelete}>
          <Trash2 size={12} />
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label>{t('compliance.serviceName')}</Label>
        <Input
          value={rule.service_name}
          onChange={(e) => onChange({ ...rule, service_name: e.target.value })}
          placeholder={t('compliance.serviceNamePlaceholder')}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>{t('compliance.hostScope')}</Label>
          <HostSelector
            hosts={hosts}
            selectedIds={rule.host_ids}
            onToggle={toggleHost}
          />
        </div>

        <div className="space-y-1.5">
          <Label>{t('compliance.expectedState')}</Label>
          <Select
            value={rule.status}
            onValueChange={(value) =>
              onChange({
                ...rule,
                status: value as ServiceRuleDraft['status'],
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">{t('compliance.anyState')}</SelectItem>
              <SelectItem value="running">{t('compliance.serviceStatus.running')}</SelectItem>
              <SelectItem value="stopped">{t('compliance.serviceStatus.stopped')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}

function PolicyModal({
  open,
  policy,
  hosts,
  catalog,
  onClose,
}: {
  open: boolean
  policy: CompliancePolicy | null
  hosts: Host[]
  catalog: ComplianceCatalogItem[]
  onClose: () => void
}) {
  const { envId } = useParams<{ envId: string }>()
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [name, setName] = useState(policy?.name ?? '')
  const [description, setDescription] = useState(policy?.description ?? '')
  const [entityKind, setEntityKind] = useState<ComplianceEntityKind>(
    policy?.entity_kind ?? 'endpoint_connectivity',
  )
  const [mode, setMode] = useState<ComplianceMode>(policy?.mode ?? 'blacklist')
  const [isEnabled, setIsEnabled] = useState(policy?.is_enabled ?? true)
  const [endpointRules, setEndpointRules] = useState<EndpointRuleDraft[]>(
    policy && isEndpointPolicy(policy)
      ? policy.definition_json.rules.map((rule) =>
        mapEndpointRuleToDraft(rule as EndpointComplianceRuleDefinition),
      )
      : [newEndpointRule()],
  )
  const [serviceRules, setServiceRules] = useState<ServiceRuleDraft[]>(
    policy && !isEndpointPolicy(policy)
      ? policy.definition_json.rules as ServiceRuleDraft[]
      : [newServiceRule()],
  )
  const [error, setError] = useState('')

  React.useEffect(() => {
    if (!open) return
    setName(policy?.name ?? '')
    setDescription(policy?.description ?? '')
    setEntityKind(policy?.entity_kind ?? 'endpoint_connectivity')
    setMode(policy?.mode ?? 'blacklist')
    setIsEnabled(policy?.is_enabled ?? true)
    setEndpointRules(
      policy && isEndpointPolicy(policy)
        ? policy.definition_json.rules.map((rule) =>
          mapEndpointRuleToDraft(rule as EndpointComplianceRuleDefinition),
        )
        : [newEndpointRule()],
    )
    setServiceRules(
      policy && !isEndpointPolicy(policy)
        ? policy.definition_json.rules as ServiceRuleDraft[]
        : [newServiceRule()],
    )
    setError('')
  }, [open, policy])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!envId) throw new Error('Environment is missing')
      if (!name.trim()) {
        throw new Error(t('compliance.policyNameRequired'))
      }

      const definition_json = entityKind === 'endpoint_connectivity'
        ? {
          rules: endpointRules.map(mapDraftToEndpointRule),
        }
        : {
          rules: serviceRules.map((rule) => ({
            ...rule,
            label: rule.label.trim(),
            service_name: rule.service_name.trim(),
          })),
        }

      if (!policy) {
        const payload: CreateCompliancePolicyPayload = {
          environment_id: envId,
          name: name.trim(),
          entity_kind: entityKind,
          mode,
          description: description.trim() || undefined,
          is_enabled: isEnabled,
          definition_json,
        }
        return stubCreateCompliancePolicy(payload)
      }

      const payload: PatchCompliancePolicyPayload = {
        name: name.trim(),
        entity_kind: entityKind,
        mode,
        description: description.trim() || undefined,
        is_enabled: isEnabled,
        definition_json,
      }
      return stubPatchCompliancePolicy(policy.id, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-policies', envId] })
      queryClient.invalidateQueries({ queryKey: ['compliance-findings', envId] })
      queryClient.invalidateQueries({ queryKey: ['compliance-events', envId] })
      onClose()
    },
    onError: (mutationError) => {
      setError(apiErrorMessage(mutationError, t('compliance.saveFailed')))
    },
  })

  const addRule = () => {
    if (entityKind === 'endpoint_connectivity') {
      setEndpointRules((prev) => [...prev, newEndpointRule()])
      return
    }
    setServiceRules((prev) => [...prev, newServiceRule()])
  }

  const isSubmitDisabled = !name.trim()
    || (entityKind === 'endpoint_connectivity' && endpointRules.length === 0)
    || (entityKind === 'service_status'
      && serviceRules.some((rule) => !rule.service_name.trim()))

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose() }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {policy ? t('compliance.editPolicy') : t('compliance.newPolicy')}
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 pb-2 space-y-5 max-h-[75vh] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t('compliance.policyName')}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('compliance.mode')}</Label>
              <Select
                value={mode}
                onValueChange={(value) => setMode(value as ComplianceMode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="blacklist">{t('compliance.modes.blacklist')}</SelectItem>
                  <SelectItem value="allowlist">{t('compliance.modes.allowlist')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t('compliance.entityKind')}</Label>
              <Select
                value={entityKind}
                onValueChange={(value) => {
                  const nextKind = value as ComplianceEntityKind
                  setEntityKind(nextKind)
                  setError('')
                  if (nextKind === 'endpoint_connectivity') {
                    setEndpointRules([newEndpointRule()])
                  } else {
                    setServiceRules([newServiceRule()])
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {catalog.map((item) => (
                    <SelectItem key={item.entity_kind} value={item.entity_kind}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{t('compliance.description')}</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('compliance.descriptionPlaceholder')}
              />
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
            {catalog.find((item) => item.entity_kind === entityKind)?.description}
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="policy-enabled"
              checked={isEnabled}
              onCheckedChange={(value) => setIsEnabled(value === true)}
            />
            <label htmlFor="policy-enabled" className="text-xs cursor-pointer">
              {t('compliance.enabled')}
            </label>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t('compliance.rules')}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('compliance.rulesHint')}
                </p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={addRule}>
                <Plus size={12} className="mr-1.5" />
                {t('compliance.addRule')}
              </Button>
            </div>

            {entityKind === 'endpoint_connectivity'
              ? endpointRules.map((rule, index) => (
                <EndpointRuleEditor
                  key={rule.id}
                  rule={rule}
                  hosts={hosts}
                  t={t}
                  onChange={(nextRule) =>
                    setEndpointRules((prev) =>
                      prev.map((item, itemIndex) =>
                        itemIndex === index ? nextRule : item,
                      ),
                    )
                  }
                  onDelete={() =>
                    setEndpointRules((prev) =>
                      prev.length > 1
                        ? prev.filter((_, itemIndex) => itemIndex !== index)
                        : prev,
                    )
                  }
                />
              ))
              : serviceRules.map((rule, index) => (
                <ServiceRuleEditor
                  key={rule.id}
                  rule={rule}
                  hosts={hosts}
                  t={t}
                  onChange={(nextRule) =>
                    setServiceRules((prev) =>
                      prev.map((item, itemIndex) =>
                        itemIndex === index ? nextRule : item,
                      ),
                    )
                  }
                  onDelete={() =>
                    setServiceRules((prev) =>
                      prev.length > 1
                        ? prev.filter((_, itemIndex) => itemIndex !== index)
                        : prev,
                    )
                  }
                />
              ))}
          </div>

          {error && (
            <p className="text-xs text-destructive font-mono">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || isSubmitDisabled}
          >
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function EnvironmentCompliance() {
  const { envId } = useParams<{ envId: string }>()
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [modalPolicy, setModalPolicy] = useState<CompliancePolicy | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const { data: hosts = [] } = useQuery({
    queryKey: ['hosts-env', envId],
    queryFn: () => stubGetHosts(envId!),
    enabled: !!envId,
  })
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

  const hostNameById = useMemo(
    () => new Map(hosts.map((host) => [host.id, host.name])),
    [hosts],
  )

  const deleteMutation = useMutation({
    mutationFn: (policyId: string) => stubDeleteCompliancePolicy(policyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compliance-policies', envId] })
      queryClient.invalidateQueries({ queryKey: ['compliance-findings', envId] })
      queryClient.invalidateQueries({ queryKey: ['compliance-events', envId] })
    },
  })

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <EnvironmentHeader
        envId={envId!}
        title={t('compliance.title')}
        right={(
          <Button size="sm" className="ml-auto h-8 gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus size={13} />
            {t('compliance.newPolicy')}
          </Button>
        )}
      />

      <PolicyModal
        open={createOpen}
        policy={null}
        hosts={hosts}
        catalog={catalog}
        onClose={() => setCreateOpen(false)}
      />
      <PolicyModal
        open={modalPolicy !== null}
        policy={modalPolicy}
        hosts={hosts}
        catalog={catalog}
        onClose={() => setModalPolicy(null)}
      />

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
              value={policies.filter((policy) => policy.mode === 'allowlist').length}
              loading={loadingPolicies}
            />
            <StatCard
              icon={History}
              label={t('compliance.recentEvents')}
              value={events.length}
              loading={loadingEvents}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {t('compliance.policies')}
              </h2>
            </div>

            {loadingPolicies ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {Array.from({ length: 2 }).map((_, index) => (
                  <div key={index} className="rounded-lg border border-border bg-card p-4 space-y-3">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-56" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ))}
              </div>
            ) : policies.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-card px-4 py-8 text-sm text-muted-foreground">
                {t('compliance.noPolicies')}
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {policies.map((policy) => (
                  <div key={policy.id} className="rounded-lg border border-border bg-card p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold">{policy.name}</p>
                          <Badge variant={policy.mode === 'allowlist' ? 'success' : 'destructive'}>
                            {t(`compliance.modes.${policy.mode}`)}
                          </Badge>
                          <Badge variant="outline">
                            {policyTypeLabel(catalog, policy.entity_kind)}
                          </Badge>
                          {policy.revision_no != null && (
                            <Badge variant="outline">
                              r{policy.revision_no}
                            </Badge>
                          )}
                          <Badge variant={policy.is_enabled ? 'blue' : 'muted'}>
                            {policy.is_enabled ? t('compliance.enabled') : t('cron.disabled')}
                          </Badge>
                        </div>
                        {policy.description && (
                          <p className="text-xs text-muted-foreground">{policy.description}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setModalPolicy(policy)}>
                          <Pencil size={12} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (window.confirm(t('compliance.deleteConfirm'))) {
                              deleteMutation.mutate(policy.id)
                            }
                          }}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {(policy.definition_json.rules || []).slice(0, 3).map((rule) => (
                        <div
                          key={String(rule.id)}
                          className="rounded-md border border-border/60 bg-muted/20 px-3 py-2"
                        >
                          <p className="text-xs font-medium">{String(rule.label || t('compliance.rule'))}</p>
                          <p className="text-[11px] text-muted-foreground mt-1">
                            {describePolicyRule(policy, rule, hostNameById, t)}
                          </p>
                        </div>
                      ))}
                      {policy.rule_count > 3 && (
                        <p className="text-[11px] text-muted-foreground">
                          {t('compliance.moreRules').replace('{count}', String(policy.rule_count - 3))}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border/60 flex items-center gap-2">
                <ShieldAlert size={13} className="text-muted-foreground" />
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t('compliance.activeViolations')}
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/20">
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">
                        {t('compliance.policy')}
                      </th>
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
                    {loadingFindings && Array.from({ length: 4 }).map((_, index) => (
                      <tr key={index} className="border-b border-border/40">
                        <td colSpan={4} className="px-4 py-3">
                          <Skeleton className="h-4 w-full" />
                        </td>
                      </tr>
                    ))}
                    {!loadingFindings && findings.map((finding) => (
                      <tr key={`${finding.policy_id}:${finding.subject_key}`} className="border-b border-border/40 last:border-0">
                        <td className="px-4 py-3 align-top">
                          <p className="text-xs font-medium">{finding.policy_name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {t(`compliance.modes.${finding.policy_mode}`)}
                          </p>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <p className="text-xs font-mono">{finding.subject_label}</p>
                          {finding.host_name && (
                            <p className="text-[11px] text-muted-foreground mt-1">
                              {finding.host_name}
                            </p>
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
                              <span className="text-[11px] text-muted-foreground">
                                {t('compliance.noMatchedRule')}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(finding.observed_at)}
                        </td>
                      </tr>
                    ))}
                    {!loadingFindings && findings.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-xs text-muted-foreground">
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
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t('compliance.events')}
                </h2>
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
                        {t('compliance.policy')}
                      </th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">
                        {t('dashboard.time')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingEvents && Array.from({ length: 4 }).map((_, index) => (
                      <tr key={index} className="border-b border-border/40">
                        <td colSpan={5} className="px-4 py-3">
                          <Skeleton className="h-4 w-full" />
                        </td>
                      </tr>
                    ))}
                    {!loadingEvents && events.map((event) => (
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
                            <p className="text-[11px] text-muted-foreground mt-1">
                              {event.host_name}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-xs font-medium">{event.policy_name}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(event.happened_at)}
                        </td>
                      </tr>
                    ))}
                    {!loadingEvents && events.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-xs text-muted-foreground">
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
      </div>
    </div>
  )
}
