import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import AgentsTable from '../components/AgentsTable'
import CreateAgentModal from '../components/modals/CreateAgentModal'
import { apiService } from '../services/api'
import { useAuthContext } from '../contexts/AuthContext'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { debounce } from '../lib/debounce.js'

const AgentsPage = () => {
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [agents, setAgents] = useState([])
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [error, setError] = useState('')
    const { isAuthenticated } = useAuthContext()

    const loadAgents = async (isBackgroundRefresh = false) => {
        if (!isAuthenticated) return

        if (!isBackgroundRefresh) {
            setLoading(true)
        } else {
            setRefreshing(true)
        }

        setError('')
        try {
            const agentsData = await apiService.getAgents()
            setAgents(agentsData)
        } catch (err) {
            setError(err.message || 'Failed to load agents')
            console.error('Error loading agents:', err)
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }

    useEffect(() => {
        loadAgents()
    }, [isAuthenticated])

    useEffect(() => {
        if (!isAuthenticated) return

        const interval = setInterval(() => {
            loadAgents(true)
        }, 5000)

        return () => clearInterval(interval)
    }, [isAuthenticated])

    const handleAgentCreate = async (newAgent) => {
        try {
            const createdAgent = await apiService.createAgent(newAgent)
            setAgents(prev => [...prev, createdAgent])
            return { success: true, data: createdAgent }
        } catch (err) {
            return { success: false, error: err }
        }
    }

    const handleAgentUpdate = async (agentId, updates) => {
        try {
            const updatedAgent = await apiService.updateAgent(agentId, updates)
            setAgents(prev => prev.map(agent =>
                agent.id === agentId ? updatedAgent : agent
            ))
            return { success: true }
        } catch (err) {
            return { success: false, error: err }
        }
    }

    const handleAgentDelete = async (agentId) => {
        try {
            await apiService.deleteAgent(agentId)
            setAgents(prev => prev.filter(agent => agent.id !== agentId))
            return { success: true }
        } catch (err) {
            return { success: false, error: err.message }
        }
    }

    const handleRefresh = () => {
        loadAgents(true)
    }

    // Debounced version of handleRefresh (400ms delay)
    const debouncedRefresh = useCallback(
        debounce(handleRefresh, 400),
        [isAuthenticated]
    );

    if (!isAuthenticated) {
        return (
            <div className="container mx-auto px-4 py-8">
                <div className="text-center">
                    <h1 className="text-2xl font-bold mb-4">Authentication Required</h1>
                    <p className="text-muted-foreground">
                        Please log in to manage your agents.
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="container mx-auto px-4 py-8 min-h-[60vh]">
            {/* Desktop layout - header with buttons on the right */}
            <div className="hidden sm:flex items-center justify-between mb-6">
                <h1 className="text-3xl font-bold">Agents Management</h1>
                <div className="flex items-center space-x-2">
                    <Button
                        variant="outline"
                        onClick={debouncedRefresh}
                        disabled={loading || refreshing}
                    >
                        <RefreshCw className={`h-4 w-4 mr-2 ${loading || refreshing ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                    <Button onClick={() => setShowCreateModal(true)}>
                        Add New Agent
                    </Button>
                </div>
            </div>
            
            {/* Mobile layout - header first, then buttons below */}
            <div className="sm:hidden mb-6">
                <h1 className="text-2xl font-bold mb-4">Agents Management</h1>
                <div className="flex items-center justify-start space-x-2">
                    <Button
                        variant="outline"
                        onClick={debouncedRefresh}
                        disabled={loading || refreshing}
                        size="sm"
                    >
                        <RefreshCw className={`h-4 w-4 mr-2 ${loading || refreshing ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                    <Button onClick={() => setShowCreateModal(true)} size="sm">
                        Add Agent
                    </Button>
                </div>
            </div>

            {error && (
                <div className="bg-destructive/15 text-destructive p-3 rounded-md flex items-center space-x-2 mb-6">
                    <AlertCircle className="h-4 w-4" />
                    <span>{error}</span>
                </div>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>My Agents</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <AgentsTable
                        agents={agents}
                        loading={loading}
                        onUpdate={handleAgentUpdate}
                        onDelete={handleAgentDelete}
                        onRefresh={debouncedRefresh}
                    />
                </CardContent>
            </Card>

            {showCreateModal && (
                <CreateAgentModal
                    onClose={() => setShowCreateModal(false)}
                    onCreate={handleAgentCreate}
                />
            )}
        </div>
    )
}

export default AgentsPage
