import React, { useCallback, useMemo, useState, useEffect } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  type OnNodeDrag,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from '@dagrejs/dagre'
import { Badge } from '@/components/ui/badge'
import { Server, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/i18n'
import type { GraphEdge, Host } from '@/api/types'

const NODE_W = 160
const NODE_H = 60
const STORAGE_KEY_PREFIX = 'graph-node-pos:'

function loadSavedPosition(nodeId: string): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${nodeId}`)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return null
}

function saveNodePosition(nodeId: string, position: { x: number; y: number }) {
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${nodeId}`, JSON.stringify(position))
  } catch { /* ignore */ }
}

function applyDagreLayout(
  nodes: Node[],
  edges: Edge[],
): Node[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 120 })

  nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }))
  edges.forEach((e) => g.setEdge(e.source, e.target))
  dagre.layout(g)

  return nodes.map((n) => {
    const saved = loadSavedPosition(n.id)
    if (saved) return { ...n, position: saved }

    const pos = g.node(n.id)
    return {
      ...n,
      position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
    }
  })
}

// ── node data types ──────────────────────────────────────────────────────────

type HostNodeData = {
  label: string
  ip: string | null
  os: string | null
  status: string
  host: Host
}

type ExternalNodeData = {
  label: string
}

// ── custom nodes ─────────────────────────────────────────────────────────────

function HostNode({ data }: NodeProps) {
  const d = data as HostNodeData
  const isOnline = d.status === 'online'
  return (
    <div
      className={cn(
        'rounded-lg border bg-card shadow-sm px-3 py-2 text-xs w-40 cursor-pointer text-foreground',
        isOnline ? 'border-green-500/40' : 'border-border',
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-border !w-2 !h-2" />
      <div className="flex items-center gap-2 min-w-0">
        <Server size={12} className="shrink-0 text-muted-foreground" />
        <span className="font-mono font-medium truncate">{d.label}</span>
        <span
          className={cn(
            'ml-auto w-2 h-2 rounded-full shrink-0',
            isOnline ? 'bg-green-400' : 'bg-muted-foreground/40',
          )}
        />
      </div>
      {d.ip && (
        <p className="font-mono text-[10px] text-muted-foreground truncate mt-1">{d.ip}</p>
      )}
      <Handle type="source" position={Position.Right} className="!bg-border !w-2 !h-2" />
    </div>
  )
}

function ExternalNode({ data }: NodeProps) {
  const d = data as ExternalNodeData
  return (
    <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 px-3 py-2 text-xs w-40 text-foreground">
      <Handle type="target" position={Position.Left} className="!bg-border !w-2 !h-2" />
      <div className="flex items-center gap-2 min-w-0">
        <Globe size={12} className="shrink-0 text-muted-foreground" />
        <span className="font-mono truncate text-muted-foreground">{d.label}</span>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-border !w-2 !h-2" />
    </div>
  )
}

const nodeTypes = { host: HostNode, external: ExternalNode }

// ── edge detail popover ───────────────────────────────────────────────────────

function EdgeDetailPopover({
  edge,
  hosts,
  anchor,
  onClose,
}: {
  edge: GraphEdge
  hosts: Host[]
  anchor: { x: number; y: number }
  onClose: () => void
}) {
  const srcHost = hosts.find((h) => h.id === edge.source_host_id)
  const dstHost = edge.target_host_id ? hosts.find((h) => h.id === edge.target_host_id) : null

  return (
    <div
      className="fixed z-50 w-72 rounded-lg border border-border bg-card shadow-xl p-4 text-xs"
      style={{ left: anchor.x + 16, top: anchor.y - 8 }}
      onMouseLeave={onClose}
    >
      <button
        className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
        onClick={onClose}
      >
        ×
      </button>
      <p className="font-semibold mb-2 text-sm">Connection Detail</p>
      <div className="space-y-1.5">
        <Row label="From" value={srcHost?.name ?? edge.source_host_id} />
        <Row label="To" value={dstHost?.name ?? edge.target_label ?? edge.target_host_id ?? '—'} />
        <Row label="Kind" value={edge.relation_kind} />
        <Row
          label="Status"
          value={
            <Badge variant={edge.status === 'reachable' ? 'success' : 'destructive'} className="text-[10px]">
              {edge.status}
            </Badge>
          }
        />
        <Row label="Observed" value={new Date(edge.observed_at).toLocaleString()} />
        {edge.expires_at && <Row label="Expires" value={new Date(edge.expires_at).toLocaleString()} />}
        {Object.keys(edge.payload_json).length > 0 && (
          <div className="mt-2">
            <p className="text-muted-foreground mb-1">Payload</p>
            <pre className="rounded bg-muted/50 p-2 text-[10px] overflow-auto max-h-32">
              {JSON.stringify(edge.payload_json, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground w-16 shrink-0">{label}</span>
      <span className="font-mono break-all">{value}</span>
    </div>
  )
}

// ── host detail popover ───────────────────────────────────────────────────────

function HostDetailPopover({
  host,
  anchor,
  onClose,
}: {
  host: Host
  anchor: { x: number; y: number }
  onClose: () => void
}) {
  return (
    <div
      className="fixed z-50 w-72 rounded-lg border border-border bg-card shadow-xl p-4 text-xs"
      style={{ left: anchor.x + 16, top: anchor.y - 8 }}
      onMouseLeave={onClose}
    >
      <button
        className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
        onClick={onClose}
      >
        ×
      </button>
      <p className="font-semibold mb-2 text-sm">{host.name}</p>
      <div className="space-y-1.5">
        <Row label="Status" value={
          <Badge variant={host.status === 'online' ? 'success' : 'muted'} className="text-[10px]">
            {host.status}
          </Badge>
        } />
        {host.hostname && <Row label="Hostname" value={host.hostname} />}
        {host.primary_ipv4 && <Row label="IPv4" value={host.primary_ipv4} />}
        {host.primary_ipv6 && <Row label="IPv6" value={host.primary_ipv6} />}
        {host.os_name && <Row label="OS" value={host.os_name} />}
        {host.last_seen_at && <Row label="Last seen" value={new Date(host.last_seen_at).toLocaleString()} />}
      </div>
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────

interface Props {
  graphEdges: GraphEdge[]
  hosts: Host[]
}

export default function EnvironmentGraph({ graphEdges, hosts }: Props) {
  const { t } = useI18n()
  const [selectedEdge, setSelectedEdge] = useState<{ edge: GraphEdge; x: number; y: number } | null>(null)
  const [selectedHost, setSelectedHost] = useState<{ host: Host; x: number; y: number } | null>(null)

  const { initialNodes, initialEdges } = useMemo(() => {
    const hostMap = new Map(hosts.map((h) => [h.id, h]))
    const nodeIds = new Set<string>()

    // Collect all node IDs from edges
    graphEdges.forEach((edge) => {
      nodeIds.add(`host:${edge.source_host_id}`)
      if (edge.target_host_id) {
        nodeIds.add(`host:${edge.target_host_id}`)
      } else if (edge.target_label) {
        nodeIds.add(`ext:${edge.target_label}`)
      }
    })

    // Add hosts that have no edges too
    hosts.forEach((h) => nodeIds.add(`host:${h.id}`))

    const rawNodes: Node[] = []
    nodeIds.forEach((nid) => {
      if (nid.startsWith('host:')) {
        const hostId = nid.slice(5)
        const host = hostMap.get(hostId)
        rawNodes.push({
          id: nid,
          type: 'host',
          position: { x: 0, y: 0 },
          data: {
            label: host?.name ?? hostId,
            ip: host?.primary_ipv4 ?? host?.primary_ipv6 ?? null,
            os: host?.os_name ?? null,
            status: host?.status ?? 'offline',
            host,
          } as HostNodeData,
        })
      } else {
        const label = nid.slice(4)
        rawNodes.push({
          id: nid,
          type: 'external',
          position: { x: 0, y: 0 },
          data: { label } as ExternalNodeData,
        })
      }
    })

    const rawEdges: Edge[] = graphEdges.map((edge) => {
      const srcId = `host:${edge.source_host_id}`
      const dstId = edge.target_host_id
        ? `host:${edge.target_host_id}`
        : `ext:${edge.target_label}`
      const isReachable = edge.status === 'reachable'
      return {
        id: edge.id,
        source: srcId,
        target: dstId ?? srcId,
        label: edge.relation_kind,
        style: {
          stroke: isReachable ? 'rgb(74 222 128 / 0.7)' : 'rgb(248 113 113 / 0.7)',
          strokeWidth: 1.5,
        },
        labelStyle: { fontSize: 9, fill: 'currentColor' },
        labelBgStyle: { fill: 'transparent' },
        data: { edge },
      }
    })

    const laidOutNodes = applyDagreLayout(rawNodes, rawEdges)
    return { initialNodes: laidOutNodes, initialEdges: rawEdges }
  }, [graphEdges, hosts])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Re-sync when props change (data loaded after mount)
  useEffect(() => {
    setNodes(initialNodes)
    setEdges(initialEdges)
  }, [initialNodes, initialEdges, setNodes, setEdges])

  const onEdgeClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      const originalEdge = graphEdges.find((e) => e.id === edge.id)
      if (!originalEdge) return
      setSelectedHost(null)
      setSelectedEdge({ edge: originalEdge, x: event.clientX, y: event.clientY })
    },
    [graphEdges],
  )

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (!node.id.startsWith('host:')) return
      const hostId = node.id.slice(5)
      const host = hosts.find((h) => h.id === hostId)
      if (!host) return
      setSelectedEdge(null)
      setSelectedHost({ host, x: event.clientX, y: event.clientY })
    },
    [hosts],
  )

  const onNodeDragStop: OnNodeDrag = useCallback((_event, node) => {
    saveNodePosition(node.id, node.position)
  }, [])

  if (graphEdges.length === 0 && hosts.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
        {t('project.loadingGraph')}
      </div>
    )
  }

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onEdgeClick={onEdgeClick}
        onNodeClick={onNodeClick}
        onPaneClick={() => { setSelectedEdge(null); setSelectedHost(null) }}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="hsl(var(--border))" gap={24} size={1} />
        <Controls showInteractive={false} className="[&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground" />
      </ReactFlow>

      {selectedEdge && (
        <EdgeDetailPopover
          edge={selectedEdge.edge}
          hosts={hosts}
          anchor={{ x: selectedEdge.x, y: selectedEdge.y }}
          onClose={() => setSelectedEdge(null)}
        />
      )}
      {selectedHost && (
        <HostDetailPopover
          host={selectedHost.host}
          anchor={{ x: selectedHost.x, y: selectedHost.y }}
          onClose={() => setSelectedHost(null)}
        />
      )}
    </>
  )
}
