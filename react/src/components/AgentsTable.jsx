import React, { useState } from 'react'
import { Button } from './ui/button'
import EditAgentModal from './modals/EditAgentModal'
import DeleteAgentModal from './modals/DeleteAgentModal'
import {
    Play,
    Pause,
    Edit,
    Trash2,
    Download,
    Eye,
    EyeOff,
    Circle,
    Loader2
} from 'lucide-react'

const AgentsTable = ({ agents, loading, onUpdate, onDelete, onRefresh }) => {
    const [editingAgent, setEditingAgent] = useState(null)
    const [deletingAgent, setDeletingAgent] = useState(null)
    const [showIp, setShowIp] = useState({})
    const [updatingAgents, setUpdatingAgents] = useState({})

    const toggleIpVisibility = (agentId) => {
        setShowIp(prev => ({
            ...prev,
            [agentId]: !prev[agentId]
        }))
    }

    const handleStatusToggle = async (agent) => {
        setUpdatingAgents(prev => ({ ...prev, [agent.id]: true }))

        const result = await onUpdate(agent.id, {
            name: agent.name,
            ip: agent.ip,
            port: agent.port,
            is_suspended: !agent.is_suspended
        }
        )

        setUpdatingAgents(prev => ({ ...prev, [agent.id]: false }))

        if (!result.success) {
            alert(`Failed to update agent: ${result.error}`)
        }
    }

    const getStatusColor = (status, isSuspended) => {
        if (isSuspended) return 'text-yellow-500 fill-yellow-500'
        if (status === 'up') return 'text-green-500 fill-green-500'
        if (status === 'down') return 'text-red-500 fill-red-500'
        return 'text-gray-500 fill-gray-500'
    }

    const getStatusText = (status, isSuspended) => {
        if (isSuspended) return 'Suspended'
        if (status === 'up') return 'Online'
        if (status === 'down') return 'Offline'
        return status
    }

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        })
    }

    const downloadDockerCompose = (agent) => {
        if (!agent.compose_file) {
            alert('No Docker Compose file available for this agent')
            return
        }

        const blob = new Blob([agent.compose_file], { type: 'text/yaml' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `docker-compose-${agent.name.replace(/\s+/g, '-').toLowerCase()}.yml`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    if (loading) {
        return (
            <div className="text-center py-8">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                <p className="text-muted-foreground">Loading agents...</p>
            </div>
        )
    }

    if (agents.length === 0) {
        return (
            <div className="text-center py-8 text-muted-foreground">
                No agents found. Create your first agent to get started.
            </div>
        )
    }

    return (
        <>
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                    <tr className="border-b bg-muted/50">
                        <th className="text-left py-4 px-6 font-medium w-1/5">Agent Name</th>
                        <th className="text-left py-4 px-6 font-medium w-1/5">IP Address</th>
                        <th className="text-left py-4 px-6 font-medium w-1/6">Port</th>
                        <th className="text-left py-4 px-6 font-medium w-1/6">Status</th>
                        <th className="text-left py-4 px-6 font-medium w-1/6">Created</th>
                        <th className="text-left py-4 px-6 font-medium w-1/5">Actions</th>
                    </tr>
                    </thead>
                    <tbody>
                    {agents.map((agent) => (
                        <tr key={agent.id} className="border-b hover:bg-muted/50">
                            {/* Agent Name */}
                            <td className="py-4 px-6 font-medium w-1/5">
                                <span className="truncate block" title={agent.name}>
                                    {agent.name}
                                </span>
                            </td>

                            {/* IP Address */}
                            <td className="py-4 px-6 max-w-36">
                                <div className="flex items-center space-x-2">
                                    {showIp[agent.id] ? (
                                        <code className="text-sm bg-muted px-2 py-1 rounded truncate flex-1">
                                            {agent.ip}
                                        </code>
                                    ) : (
                                        <span className="text-muted-foreground truncate flex-1 tracking-[0.25rem]">
                                            ••••••••••
                                        </span>
                                    )}
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0 flex-shrink-0"
                                        onClick={() => toggleIpVisibility(agent.id)}
                                    >
                                        {showIp[agent.id] ? (
                                            <Eye className="h-4 w-4"/>
                                        ) : (
                                            <EyeOff className="h-4 w-4"/>
                                        )}
                                    </Button>
                                </div>
                            </td>

                            {/* Port */}
                            <td className="py-4 px-6 w-1/6">
                                <code className="text-sm bg-muted px-2 py-1 rounded">
                                    {agent.port}
                                </code>
                            </td>

                            {/* Status */}
                            <td className="py-4 px-6 w-1/6">
                                <div className="flex items-center space-x-2">
                                    <Circle className={`h-2 w-2 ${getStatusColor(agent.status, agent.is_suspended)}`} />
                                    <span className="truncate">
                                        {getStatusText(agent.status, agent.is_suspended)}
                                    </span>
                                </div>
                            </td>

                            {/* Created Date */}
                            <td className="py-4 px-6 text-sm text-muted-foreground w-1/6">
                                {formatDate(agent.created_at)}
                            </td>

                            {/* Actions */}
                            <td className="py-4 px-6 w-1/5">
                                <div className="flex items-center space-x-1">
                                    {/* Play/Pause Button */}
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleStatusToggle(agent)}
                                        className="h-8 w-8 p-0"
                                        disabled={updatingAgents[agent.id]}
                                        title={agent.is_suspended ? 'Resume' : 'Suspend'}
                                    >
                                        {updatingAgents[agent.id] ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : agent.is_suspended ? (
                                            <Play className="h-4 w-4" />
                                        ) : (
                                            <Pause className="h-4 w-4" />
                                        )}
                                    </Button>

                                    {/* Edit Button */}
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setEditingAgent(agent)}
                                        className="h-8 w-8 p-0"
                                        title="Edit"
                                    >
                                        <Edit className="h-4 w-4"/>
                                    </Button>

                                    {/* Download Docker Compose Button */}
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => downloadDockerCompose(agent)}
                                        className="h-8 w-8 p-0"
                                        title="Download Docker Compose"
                                    >
                                        <Download className="h-4 w-4"/>
                                    </Button>

                                    {/* Delete Button */}
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setDeletingAgent(agent)}
                                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                        title="Delete"
                                    >
                                        <Trash2 className="h-4 w-4"/>
                                    </Button>
                                </div>
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>

            {editingAgent && (
                <EditAgentModal
                    agent={editingAgent}
                    onClose={() => setEditingAgent(null)}
                    onUpdate={async (updates) => {
                        const result = await onUpdate(editingAgent.id, updates)
                        return result
                    }}
                />
            )}

            {deletingAgent && (
                <DeleteAgentModal
                    agent={deletingAgent}
                    onClose={() => setDeletingAgent(null)}
                    onDelete={async () => {
                        const result = await onDelete(deletingAgent.id)
                        if (result.success) {
                            setDeletingAgent(null)
                        }
                        return result
                    }}
                />
            )}
        </>
    )
}

export default AgentsTable
