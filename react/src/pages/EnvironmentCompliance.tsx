import React, { useEffect, useMemo, useState } from 'react'
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
  stubGetHosts,
  stubPatchCompliancePolicy,
  type CreateCompliancePolicyPayload,
  type PatchCompliancePolicyPayload,
} from '@/api/stubs'
import type {
  CommandOutputComplianceRuleDefinition,
  ComplianceCatalogItem,
  ComplianceEntityKind,
  ComplianceEvent,
  ComplianceFinding,
  ComplianceMode,
  CompliancePolicy,
  EndpointComplianceRuleDefinition,
  Host,
  PortBindingComplianceRuleDefinition,
  ServiceComplianceRuleDefinition,
} from '@/api/types'
import { cn, formatDate } from '@/lib/utils'
import { useI18n } from '@/i18n'

type EndpointRuleDraft = EndpointComplianceRuleDefinition & {
  target_mode: 'any' | 'hosts' | 'endpoint'
}

type ServiceRuleDraft = ServiceComplianceRuleDefinition
type CommandOutputRuleDraft = CommandOutputComplianceRuleDefinition
type PortBindingRuleDraft = PortBindingComplianceRuleDefinition

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

function newCommandOutputRule(): CommandOutputRuleDraft {
  return {
    id: nextRuleId(),
    label: '',
    host_ids: [],
    command_pattern: null,
    output_pattern: '',
  }
}

function newPortBindingRule(): PortBindingRuleDraft {
  return {
    id: nextRuleId(),
    label: '',
    host_ids: [],
    protocol: 'tcp',
    local_address: null,
    local_subnet: null,
    state: 'listening',
    port_from: null,
    port_to: null,
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

function isEndpointEntityKind(entityKind: ComplianceEntityKind) {
  return entityKind === 'endpoint_connectivity'
}

function isServiceEntityKind(entityKind: ComplianceEntityKind) {
  return entityKind === 'service_status'
}

function isCommandOutputEntityKind(entityKind: ComplianceEntityKind) {
  return entityKind === 'command_output'
}

function isPortBindingEntityKind(entityKind: ComplianceEntityKind) {
  return entityKind === 'port_binding'
}

function isEndpointPolicy(policy: CompliancePolicy) {
  return isEndpointEntityKind(policy.entity_kind)
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

function EndpointRuleTable({
  rules,
  hosts,
  onChange,
  onDelete,
  t,
}: {
  rules: EndpointRuleDraft[]
  hosts: Host[]
  onChange: (index: number, nextRule: EndpointRuleDraft) => void
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
      <table className="w-full min-w-[980px] text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/20">
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('compliance.rule')}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('compliance.sourceHosts')}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('compliance.targetMode')}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('compliance.targetEndpoint')}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('compliance.expectedConnectivity')}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('compliance.maxLatency')}</th>
            <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">{t('common.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule, index) => {
            const toggleSourceHost = (hostId: string) => {
              onChange(index, {
                ...rule,
                source_host_ids: rule.source_host_ids.includes(hostId)
                  ? rule.source_host_ids.filter((id) => id !== hostId)
                  : [...rule.source_host_ids, hostId],
              })
            }

            const toggleTargetHost = (hostId: string) => {
              onChange(index, {
                ...rule,
                target_host_ids: rule.target_host_ids.includes(hostId)
                  ? rule.target_host_ids.filter((id) => id !== hostId)
                  : [...rule.target_host_ids, hostId],
              })
            }

            return (
              <tr key={rule.id} className="border-b border-border/40 align-top last:border-0">
                <td className="px-3 py-3">
                  <Input
                    value={rule.label}
                    onChange={(e) => onChange(index, { ...rule, label: e.target.value })}
                    placeholder={t('compliance.ruleLabelPlaceholder')}
                  />
                </td>
                <td className="px-3 py-3">
                  <HostSelector
                    hosts={hosts}
                    selectedIds={rule.source_host_ids}
                    onToggle={toggleSourceHost}
                  />
                </td>
                <td className="px-3 py-3">
                  <Select
                    value={rule.target_mode}
                    onValueChange={(value) =>
                      onChange(index, {
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
                </td>
                <td className="px-3 py-3">
                  {rule.target_mode === 'hosts' ? (
                    <HostSelector
                      hosts={hosts}
                      selectedIds={rule.target_host_ids}
                      onToggle={toggleTargetHost}
                    />
                  ) : rule.target_mode === 'endpoint' ? (
                    <Input
                      value={rule.target_endpoint ?? ''}
                      onChange={(e) =>
                        onChange(index, {
                          ...rule,
                          target_endpoint: e.target.value,
                        })
                      }
                      placeholder={t('compliance.targetEndpointPlaceholder')}
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">{t('compliance.anyTarget')}</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <Select
                    value={rule.connectivity}
                    onValueChange={(value) =>
                      onChange(index, {
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
                </td>
                <td className="px-3 py-3">
                  <Input
                    type="number"
                    min="0"
                    value={rule.max_latency_ms ?? ''}
                    onChange={(e) =>
                      onChange(index, {
                        ...rule,
                        max_latency_ms: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                    placeholder="50"
                  />
                </td>
                <td className="px-3 py-3 text-right">
                  <Button type="button" size="sm" variant="ghost" onClick={() => onDelete(index)}>
                    <Trash2 size={12} />
                  </Button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ServiceRuleTable({
  rules,
  hosts,
  onChange,
  onDelete,
  t,
}: {
  rules: ServiceRuleDraft[]
  hosts: Host[]
  onChange: (index: number, nextRule: ServiceRuleDraft) => void
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
      <table className="w-full min-w-[840px] text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/20">
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('compliance.rule')}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('compliance.hostScope')}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('compliance.serviceName')}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('compliance.expectedState')}</th>
            <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">{t('common.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule, index) => {
            const toggleHost = (hostId: string) => {
              onChange(index, {
                ...rule,
                host_ids: rule.host_ids.includes(hostId)
                  ? rule.host_ids.filter((id) => id !== hostId)
                  : [...rule.host_ids, hostId],
              })
            }

            return (
              <tr key={rule.id} className="border-b border-border/40 align-top last:border-0">
                <td className="px-3 py-3">
                  <Input
                    value={rule.label}
                    onChange={(e) => onChange(index, { ...rule, label: e.target.value })}
                    placeholder={t('compliance.ruleLabelPlaceholder')}
                  />
                </td>
                <td className="px-3 py-3">
                  <HostSelector
                    hosts={hosts}
                    selectedIds={rule.host_ids}
                    onToggle={toggleHost}
                  />
                </td>
                <td className="px-3 py-3">
                  <Input
                    value={rule.service_name}
                    onChange={(e) => onChange(index, { ...rule, service_name: e.target.value })}
                    placeholder={t('compliance.serviceNamePlaceholder')}
                  />
                </td>
                <td className="px-3 py-3">
                  <Select
                    value={rule.status}
                    onValueChange={(value) =>
                      onChange(index, {
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
                </td>
                <td className="px-3 py-3 text-right">
                  <Button type="button" size="sm" variant="ghost" onClick={() => onDelete(index)}>
                    <Trash2 size={12} />
                  </Button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function CommandOutputRuleTable({
  rules,
  hosts,
  onChange,
  onDelete,
  t,
}: {
  rules: CommandOutputRuleDraft[]
  hosts: Host[]
  onChange: (index: number, nextRule: CommandOutputRuleDraft) => void
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
      <table className="w-full min-w-[920px] text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/20">
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('compliance.rule')}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('compliance.hostScope')}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('compliance.commandPattern')}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('compliance.outputPattern')}</th>
            <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">{t('common.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule, index) => {
            const toggleHost = (hostId: string) => {
              onChange(index, {
                ...rule,
                host_ids: rule.host_ids.includes(hostId)
                  ? rule.host_ids.filter((id) => id !== hostId)
                  : [...rule.host_ids, hostId],
              })
            }

            return (
              <tr key={rule.id} className="border-b border-border/40 align-top last:border-0">
                <td className="px-3 py-3">
                  <Input
                    value={rule.label}
                    onChange={(e) => onChange(index, { ...rule, label: e.target.value })}
                    placeholder={t('compliance.ruleLabelPlaceholder')}
                  />
                </td>
                <td className="px-3 py-3">
                  <HostSelector
                    hosts={hosts}
                    selectedIds={rule.host_ids}
                    onToggle={toggleHost}
                  />
                </td>
                <td className="px-3 py-3">
                  <Input
                    value={rule.command_pattern ?? ''}
                    onChange={(e) =>
                      onChange(index, {
                        ...rule,
                        command_pattern: e.target.value.trim() || null,
                      })
                    }
                    placeholder={t('compliance.commandPatternPlaceholder')}
                  />
                </td>
                <td className="px-3 py-3">
                  <Input
                    value={rule.output_pattern}
                    onChange={(e) => onChange(index, { ...rule, output_pattern: e.target.value })}
                    placeholder={t('compliance.outputPatternPlaceholder')}
                  />
                </td>
                <td className="px-3 py-3 text-right">
                  <Button type="button" size="sm" variant="ghost" onClick={() => onDelete(index)}>
                    <Trash2 size={12} />
                  </Button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function PortBindingRuleTable({
  rules,
  hosts,
  onChange,
  onDelete,
  t,
}: {
  rules: PortBindingRuleDraft[]
  hosts: Host[]
  onChange: (index: number, nextRule: PortBindingRuleDraft) => void
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
      <table className="w-full min-w-[1120px] text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/20">
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('compliance.rule')}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('compliance.hostScope')}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('compliance.protocol')}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('compliance.localAddress')}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('compliance.localSubnet')}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('compliance.expectedState')}</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{t('compliance.portRange')}</th>
            <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">{t('common.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule, index) => {
            const toggleHost = (hostId: string) => {
              onChange(index, {
                ...rule,
                host_ids: rule.host_ids.includes(hostId)
                  ? rule.host_ids.filter((id) => id !== hostId)
                  : [...rule.host_ids, hostId],
              })
            }

            return (
              <tr key={rule.id} className="border-b border-border/40 align-top last:border-0">
                <td className="px-3 py-3">
                  <Input
                    value={rule.label}
                    onChange={(e) => onChange(index, { ...rule, label: e.target.value })}
                    placeholder={t('compliance.ruleLabelPlaceholder')}
                  />
                </td>
                <td className="px-3 py-3">
                  <HostSelector
                    hosts={hosts}
                    selectedIds={rule.host_ids}
                    onToggle={toggleHost}
                  />
                </td>
                <td className="px-3 py-3">
                  <Select
                    value={rule.protocol}
                    onValueChange={(value) =>
                      onChange(index, { ...rule, protocol: value as PortBindingRuleDraft['protocol'] })
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">{t('compliance.anyProtocol')}</SelectItem>
                      <SelectItem value="tcp">TCP</SelectItem>
                      <SelectItem value="udp">UDP</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-3">
                  <Input
                    value={rule.local_address ?? ''}
                    onChange={(e) =>
                      onChange(index, {
                        ...rule,
                        local_address: e.target.value.trim() || null,
                        local_subnet: e.target.value.trim() ? null : rule.local_subnet,
                      })
                    }
                    placeholder={t('compliance.localAddressPlaceholder')}
                  />
                </td>
                <td className="px-3 py-3">
                  <Input
                    value={rule.local_subnet ?? ''}
                    onChange={(e) =>
                      onChange(index, {
                        ...rule,
                        local_subnet: e.target.value.trim() || null,
                        local_address: e.target.value.trim() ? null : rule.local_address,
                      })
                    }
                    placeholder={t('compliance.localSubnetPlaceholder')}
                  />
                </td>
                <td className="px-3 py-3">
                  <Select
                    value={rule.state}
                    onValueChange={(value) =>
                      onChange(index, { ...rule, state: value as PortBindingRuleDraft['state'] })
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">{t('compliance.anyState')}</SelectItem>
                      <SelectItem value="listening">{t('compliance.portState.listening')}</SelectItem>
                      <SelectItem value="established">{t('compliance.portState.established')}</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      min="1"
                      max="65535"
                      value={rule.port_from ?? ''}
                      onChange={(e) =>
                        onChange(index, {
                          ...rule,
                          port_from: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                      placeholder={t('compliance.portFrom')}
                    />
                    <Input
                      type="number"
                      min="1"
                      max="65535"
                      value={rule.port_to ?? ''}
                      onChange={(e) =>
                        onChange(index, {
                          ...rule,
                          port_to: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                      placeholder={t('compliance.portTo')}
                    />
                  </div>
                </td>
                <td className="px-3 py-3 text-right">
                  <Button type="button" size="sm" variant="ghost" onClick={() => onDelete(index)}>
                    <Trash2 size={12} />
                  </Button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ComplianceTypePanel({
  envId,
  catalogItem,
  policy,
  legacyPolicies,
  hosts,
  findings,
  events,
}: {
  envId: string
  catalogItem: ComplianceCatalogItem
  policy: CompliancePolicy | null
  legacyPolicies: CompliancePolicy[]
  hosts: Host[]
  findings: ComplianceFinding[]
  events: ComplianceEvent[]
}) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<ComplianceMode>(policy?.mode ?? 'blacklist')
  const [isEnabled, setIsEnabled] = useState(policy?.is_enabled ?? true)
  const [endpointRules, setEndpointRules] = useState<EndpointRuleDraft[]>(
    policy && isEndpointPolicy(policy)
      ? policy.definition_json.rules.map((rule) =>
        mapEndpointRuleToDraft(rule as EndpointComplianceRuleDefinition),
      )
      : [],
  )
  const [serviceRules, setServiceRules] = useState<ServiceRuleDraft[]>(
    policy && isServiceEntityKind(policy.entity_kind)
      ? policy.definition_json.rules as ServiceRuleDraft[]
      : [],
  )
  const [commandOutputRules, setCommandOutputRules] = useState<CommandOutputRuleDraft[]>(
    policy && isCommandOutputEntityKind(policy.entity_kind)
      ? policy.definition_json.rules as CommandOutputRuleDraft[]
      : [],
  )
  const [portBindingRules, setPortBindingRules] = useState<PortBindingRuleDraft[]>(
    policy && isPortBindingEntityKind(policy.entity_kind)
      ? policy.definition_json.rules as PortBindingRuleDraft[]
      : [],
  )
  const [error, setError] = useState('')

  useEffect(() => {
    setMode(policy?.mode ?? 'blacklist')
    setIsEnabled(policy?.is_enabled ?? true)
    setEndpointRules(
      policy && isEndpointPolicy(policy)
        ? policy.definition_json.rules.map((rule) =>
          mapEndpointRuleToDraft(rule as EndpointComplianceRuleDefinition),
        )
        : [],
    )
    setServiceRules(
      policy && isServiceEntityKind(policy.entity_kind)
        ? policy.definition_json.rules as ServiceRuleDraft[]
        : [],
    )
    setCommandOutputRules(
      policy && isCommandOutputEntityKind(policy.entity_kind)
        ? policy.definition_json.rules as CommandOutputRuleDraft[]
        : [],
    )
    setPortBindingRules(
      policy && isPortBindingEntityKind(policy.entity_kind)
        ? policy.definition_json.rules as PortBindingRuleDraft[]
        : [],
    )
    setError('')
  }, [catalogItem.entity_kind, policy])

  const invalidateCompliance = () => {
    queryClient.invalidateQueries({ queryKey: ['compliance-policies', envId] })
    queryClient.invalidateQueries({ queryKey: ['compliance-findings', envId] })
    queryClient.invalidateQueries({ queryKey: ['compliance-events', envId] })
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const definition_json = (() => {
        if (isEndpointEntityKind(catalogItem.entity_kind)) {
          return {
            rules: endpointRules.map(mapDraftToEndpointRule),
          }
        }
        if (isServiceEntityKind(catalogItem.entity_kind)) {
          return {
            rules: serviceRules.map((rule) => ({
              ...rule,
              label: rule.label.trim(),
              service_name: rule.service_name.trim(),
            })),
          }
        }
        if (isCommandOutputEntityKind(catalogItem.entity_kind)) {
          return {
            rules: commandOutputRules.map((rule) => ({
              ...rule,
              label: rule.label.trim(),
              command_pattern: rule.command_pattern?.trim() || null,
              output_pattern: rule.output_pattern.trim(),
            })),
          }
        }
        return {
          rules: portBindingRules.map((rule) => ({
            ...rule,
            label: rule.label.trim(),
            local_address: rule.local_address?.trim() || null,
            local_subnet: rule.local_subnet?.trim() || null,
          })),
        }
      })()

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
    mutationFn: async (policyId: string) => stubDeleteCompliancePolicy(policyId),
    onSuccess: () => {
      invalidateCompliance()
    },
    onError: (mutationError) => {
      setError(apiErrorMessage(mutationError, t('compliance.saveFailed')))
    },
  })

  const addRule = () => {
    if (isEndpointEntityKind(catalogItem.entity_kind)) {
      setEndpointRules((prev) => [...prev, newEndpointRule()])
      return
    }
    if (isServiceEntityKind(catalogItem.entity_kind)) {
      setServiceRules((prev) => [...prev, newServiceRule()])
      return
    }
    if (isCommandOutputEntityKind(catalogItem.entity_kind)) {
      setCommandOutputRules((prev) => [...prev, newCommandOutputRule()])
      return
    }
    setPortBindingRules((prev) => [...prev, newPortBindingRule()])
  }

  const isSubmitDisabled = (() => {
    if (isEndpointEntityKind(catalogItem.entity_kind)) {
      return endpointRules.length === 0
    }
    if (isServiceEntityKind(catalogItem.entity_kind)) {
      return serviceRules.length === 0 || serviceRules.some((rule) => !rule.service_name.trim())
    }
    if (isCommandOutputEntityKind(catalogItem.entity_kind)) {
      return commandOutputRules.length === 0 || commandOutputRules.some((rule) => !rule.output_pattern.trim())
    }
    return portBindingRules.length === 0
  })()

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-5 space-y-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold">{catalogItem.label}</h2>
              <Badge variant="outline">{t('compliance.rules')}</Badge>
              {policy?.revision_no != null && (
                <Badge variant="outline">r{policy.revision_no}</Badge>
              )}
              <Badge variant={isEnabled ? 'blue' : 'muted'}>
                {isEnabled ? t('compliance.enabled') : t('cron.disabled')}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground max-w-3xl">{catalogItem.description}</p>
            {!policy && (
              <p className="text-xs text-muted-foreground">{t('compliance.ruleSetHint')}</p>
            )}
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
                id={`rules-enabled-${catalogItem.entity_kind}`}
                checked={isEnabled}
                onCheckedChange={(value) => setIsEnabled(value === true)}
              />
              <label htmlFor={`rules-enabled-${catalogItem.entity_kind}`} className="text-xs cursor-pointer">
                {t('compliance.enabled')}
              </label>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Button type="button" size="sm" onClick={addRule}>
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
                      deleteMutation.mutate(policy.id)
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

        {legacyPolicies.length > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 space-y-3">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
              <TriangleAlert size={14} />
              <p className="text-sm font-medium">{t('compliance.legacyPolicies')}</p>
            </div>
            <p className="text-xs text-muted-foreground">{t('compliance.legacyPoliciesHint')}</p>
            <div className="flex flex-wrap gap-2">
              {legacyPolicies.map((legacyPolicy) => (
                <Button
                  key={legacyPolicy.id}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (window.confirm(t('compliance.deleteRuleSetConfirm'))) {
                      deleteMutation.mutate(legacyPolicy.id)
                    }
                  }}
                >
                  <Trash2 size={12} className="mr-1.5" />
                  {legacyPolicy.name}
                </Button>
              ))}
            </div>
          </div>
        )}

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
          </div>

          {isEndpointEntityKind(catalogItem.entity_kind) ? (
            <EndpointRuleTable
              rules={endpointRules}
              hosts={hosts}
              onChange={(index, nextRule) =>
                setEndpointRules((prev) =>
                  prev.map((item, itemIndex) => (itemIndex === index ? nextRule : item)),
                )
              }
              onDelete={(index) =>
                setEndpointRules((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
              }
              t={t}
            />
          ) : isServiceEntityKind(catalogItem.entity_kind) ? (
            <ServiceRuleTable
              rules={serviceRules}
              hosts={hosts}
              onChange={(index, nextRule) =>
                setServiceRules((prev) =>
                  prev.map((item, itemIndex) => (itemIndex === index ? nextRule : item)),
                )
              }
              onDelete={(index) =>
                setServiceRules((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
              }
              t={t}
            />
          ) : isCommandOutputEntityKind(catalogItem.entity_kind) ? (
            <CommandOutputRuleTable
              rules={commandOutputRules}
              hosts={hosts}
              onChange={(index, nextRule) =>
                setCommandOutputRules((prev) =>
                  prev.map((item, itemIndex) => (itemIndex === index ? nextRule : item)),
                )
              }
              onDelete={(index) =>
                setCommandOutputRules((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
              }
              t={t}
            />
          ) : (
            <PortBindingRuleTable
              rules={portBindingRules}
              hosts={hosts}
              onChange={(index, nextRule) =>
                setPortBindingRules((prev) =>
                  prev.map((item, itemIndex) => (itemIndex === index ? nextRule : item)),
                )
              }
              onDelete={(index) =>
                setPortBindingRules((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
              }
              t={t}
            />
          )}
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
  const [selectedEntityKind, setSelectedEntityKind] = useState<ComplianceEntityKind>('endpoint_connectivity')

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

  useEffect(() => {
    if (catalog.length === 0) return
    if (!catalog.some((item) => item.entity_kind === selectedEntityKind)) {
      setSelectedEntityKind(catalog[0].entity_kind)
    }
  }, [catalog, selectedEntityKind])

  const policiesByKind = useMemo(() => {
    const grouped = new Map<ComplianceEntityKind, CompliancePolicy[]>()
    for (const item of catalog) {
      grouped.set(
        item.entity_kind,
        policies.filter((policy) => policy.entity_kind === item.entity_kind),
      )
    }
    return grouped
  }, [catalog, policies])

  const selectedCatalogItem = catalog.find((item) => item.entity_kind === selectedEntityKind) ?? null
  const selectedPolicies = selectedCatalogItem
    ? (policiesByKind.get(selectedCatalogItem.entity_kind) ?? [])
    : []
  const selectedPolicy = selectedPolicies[0] ?? null
  const selectedLegacyPolicies = selectedPolicies.slice(1)

  const selectedFindings = findings.filter((finding) => finding.entity_kind === selectedEntityKind)
  const selectedEvents = events.filter((event) => event.entity_kind === selectedEntityKind)

  const configuredTypes = Array.from(policiesByKind.values()).filter((items) => items.length > 0).length
  const allowanceModes = Array.from(policiesByKind.values()).filter(
    (items) => items[0]?.mode === 'allowlist',
  ).length

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <EnvironmentHeader envId={envId!} title={t('compliance.title')} />

      <div className="flex-1 overflow-y-auto">
        <div className="p-5 space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              icon={ShieldCheck}
              label={t('compliance.configuredTypes')}
              value={configuredTypes}
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
              label={t('compliance.allowanceModes')}
              value={allowanceModes}
              loading={loadingPolicies}
            />
            <StatCard
              icon={History}
              label={t('compliance.recentEvents')}
              value={events.length}
              loading={loadingEvents}
            />
          </div>

          <div className="rounded-xl border border-border bg-card p-3">
            <div className="flex flex-wrap gap-2">
              {catalog.map((item) => {
                const typePolicies = policiesByKind.get(item.entity_kind) ?? []
                const activePolicy = typePolicies[0] ?? null
                const violationCount = findings.filter((finding) => finding.entity_kind === item.entity_kind).length
                return (
                  <button
                    key={item.entity_kind}
                    type="button"
                    onClick={() => setSelectedEntityKind(item.entity_kind)}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-left min-w-[220px] transition-colors',
                      selectedEntityKind === item.entity_kind
                        ? 'border-foreground/20 bg-accent text-foreground'
                        : 'border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent/40',
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="text-[11px] mt-1">
                          {activePolicy
                            ? `${activePolicy.rule_count} ${t('compliance.rules').toLowerCase()}`
                            : t('compliance.noRulesConfigured')}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {violationCount > 0 && (
                          <Badge variant="destructive">{violationCount}</Badge>
                        )}
                        {activePolicy && (
                          <Badge variant={activePolicy.mode === 'allowlist' ? 'success' : 'outline'}>
                            {t(`compliance.modes.${activePolicy.mode}`)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {selectedCatalogItem && envId && (
            <ComplianceTypePanel
              envId={envId}
              catalogItem={selectedCatalogItem}
              policy={selectedPolicy}
              legacyPolicies={selectedLegacyPolicies}
              hosts={hosts}
              findings={selectedFindings}
              events={selectedEvents}
            />
          )}
        </div>
      </div>
    </div>
  )
}
