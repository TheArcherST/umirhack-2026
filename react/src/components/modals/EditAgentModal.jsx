import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Download, Loader2 } from 'lucide-react'

const EditAgentModal = ({ agent, onClose, onUpdate }) => {
    const [formData, setFormData] = useState({
        name: agent.name,
        ip: agent.ip,
        port: agent.port,
        is_suspended: agent.is_suspended
    })
    const [showDockerCompose, setShowDockerCompose] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError('')

        const result = await onUpdate(formData)

        if (result.success) {
            setShowDockerCompose(true)
        } else {
            setError(result.error)
        }

        setLoading(false)
    }

    const handleChange = (e) => {
        const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
        setFormData(prev => ({
            ...prev,
            [e.target.name]: value
        }))
        if (error) setError('')
    }

    const downloadDockerCompose = () => {
        const blob = new Blob([agent.compose_file], { type: 'text/yaml' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `docker-compose-${formData.name.replace(/\s+/g, '-').toLowerCase()}.yml`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    const handleFinalClose = () => {
        onClose()
        setShowDockerCompose(false)
    }

    if (showDockerCompose) {
        return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <CardTitle>Agent Updated Successfully!</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Download the updated Docker Compose file for your agent:
                        </p>
                        <div className="flex space-x-3">
                            <Button onClick={downloadDockerCompose} className="flex-1">
                                <Download className="h-4 w-4 mr-2" />
                                Download Docker Compose
                            </Button>
                            <Button variant="outline" onClick={handleFinalClose}>
                                Close
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>Edit Agent</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {error && (
                            <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md space-y-1">
                                {Array.isArray(error) ? (
                                    error.map((err, index) => (
                                        <div key={index} className="flex items-start space-x-1">
                                            <span className="font-medium capitalize">{err.field}:</span>
                                            <span>{err.message}</span>
                                        </div>
                                    ))
                                ) : (
                                    <div>{error}</div>
                                )}
                            </div>
                        )}

                        <div>
                            <label className="text-sm font-medium">Agent Name</label>
                            <Input
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                placeholder="Enter agent name"
                                required
                                disabled={loading}
                            />
                        </div>

                        <div>
                            <label className="text-sm font-medium">IP Address</label>
                            <Input
                                name="ip"
                                value={formData.ip}
                                onChange={handleChange}
                                placeholder="192.168.1.100"
                                required
                                disabled={loading}
                            />
                        </div>

                        <div>
                            <label className="text-sm font-medium">Port</label>
                            <Input
                                name="port"
                                value={formData.port}
                                onChange={handleChange}
                                placeholder="8080"
                                required
                                disabled={loading}
                            />
                        </div>

                        <div className="flex items-center space-x-2">
                            <input
                                type="checkbox"
                                name="is_suspended"
                                checked={formData.is_suspended}
                                onChange={handleChange}
                                disabled={loading}
                                className="rounded border-gray-300"
                            />
                            <label className="text-sm font-medium">
                                Suspend agent (pause monitoring)
                            </label>
                        </div>

                        <div className="flex space-x-3">
                            <Button
                                type="submit"
                                className="flex-1"
                                disabled={loading}
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Updating...
                                    </>
                                ) : (
                                    'Save Changes'
                                )}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={onClose}
                                disabled={loading}
                            >
                                Cancel
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}

export default EditAgentModal
