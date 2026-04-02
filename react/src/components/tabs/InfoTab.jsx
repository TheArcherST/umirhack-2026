import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import MapView from "../MapView.jsx";

const InfoTab = ({ data, loading, error, onRetry, target }) => {
    if (loading && !data) {
        return (
            <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                <p className="text-muted-foreground mt-2">Loading basic information...</p>
            </div>
        )
    }

    if (error) {
        return (
            <div className="text-center py-8">
                <p className="text-red-600 mb-4">Error: {error}</p>
                <button
                    onClick={onRetry}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
                >
                    Retry
                </button>
            </div>
        )
    }

    if (!data || !Array.isArray(data) || data.length === 0) {
        return (
            <div className="text-center py-8 text-muted-foreground">
                No data available
            </div>
        )
    }

    const InfoRow = ({ label, value }) => (
        <div className="flex justify-between py-2 border-b">
            <span className="font-medium text-muted-foreground">{label}</span>
            <span className="text-right">{value}</span>
        </div>
    )

    const AgentCard = ({ agentData }) => (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle>{agentData.agent}</CardTitle>
                    <span className={`px-2 py-1 rounded text-xs ${
                        agentData.is_failed
                            ? 'bg-red-100 text-red-800'
                            : agentData.ip === 'N/A' ? 'bg-amber-200 text-amber-700' : 'bg-green-100 text-green-800'
                    }`}>
                        {agentData.is_failed ? 'Failed' :
                            agentData.ip === 'N/A' ? 'Pending' : 'Success'}
                    </span>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Desktop: Horizontal layout, Mobile/Tablet: Vertical layout */}
                <div className="flex flex-col gap-8 lg:flex-row lg:gap-6">
                    {/* Basic Information Section */}
                    <div className="flex-1 space-y-2">
                        <InfoRow label="Target" value={target} />
                        <InfoRow label="IP Address" value={agentData.ip} />
                        <InfoRow label="ISP / Organization" value={agentData.isp} />
                        <InfoRow label="Country" value={agentData.country} />
                        <InfoRow label="Region" value={agentData.region} />
                        <InfoRow label="City" value={agentData.city} />
                        <InfoRow label="Postal Code" value={agentData.postalCode} />
                        <InfoRow label="Timezone" value={agentData.timezone} />
                        <InfoRow label="Local Time" value={agentData.localTime} />
                        <InfoRow label="Coordinates" value={`${agentData.coordinates.lat.toFixed(4)}, ${agentData.coordinates.lng.toFixed(4)}`} />
                    </div>

                    {/* Location Map Section */}
                    <div className="flex-1 flex flex-col">
                        <div className="flex-1">
                            <MapView
                                coordinates={agentData.coordinates}
                                location={`${agentData.city}, ${agentData.country}`}
                                height="100%"
                                className="h-full"
                            />
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    )

    return (
        <div className="space-y-6">
            {data.map((agentData, index) => (
                <AgentCard key={index} agentData={agentData} />
            ))}
        </div>
    )
}

export default InfoTab
