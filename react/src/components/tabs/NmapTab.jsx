import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { ChevronDown, ChevronRight, AlertCircle } from 'lucide-react'

const NmapTab = ({ data, loading, error, onRetry }) => {
    const [expandedOS, setExpandedOS] = useState(false)
    const [expandedPorts, setExpandedPorts] = useState({})

    const toggleOSExpand = () => {
        setExpandedOS(!expandedOS)
    }

    const togglePortExpand = (ip, portId) => {
        const key = `${ip}-${portId}`
        setExpandedPorts(prev => ({
            ...prev,
            [key]: !prev[key]
        }))
    }

    const getPortStateColor = (state) => {
        switch (state) {
            case 'open':
                return 'bg-green-100 text-green-800'
            case 'closed':
                return 'bg-gray-100 text-gray-800'
            case 'filtered':
                return 'bg-yellow-100 text-yellow-800'
            default:
                return 'bg-blue-100 text-blue-800'
        }
    }

    if (loading && !data) {
        return (
            <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                <p className="text-muted-foreground mt-2">Running Nmap scan...</p>
            </div>
        )
    }

    if (error) {
        return (
            <div className="text-center py-8">
                <div className="flex items-center justify-center mb-4">
                    <AlertCircle className="h-6 w-6 text-red-600 mr-2" />
                    <p className="text-red-600">Error: {error}</p>
                </div>
                <Button onClick={onRetry}>
                    Retry Nmap Scan
                </Button>
            </div>
        )
    }

    if (!data) {
        return (
            <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">No Nmap data available</p>
                <p className="text-sm text-muted-foreground">
                    Open this tab to run Nmap scan
                </p>
            </div>
        )
    }

    // Получаем данные nmap из результата
    const nmapResult = data?.os_detection; // можно выбрать другое поле

    const ips = Object.keys(nmapResult).filter(key => key !== 'runtime' && key !== 'stats' && key !== 'task_results')

    if (ips.length === 0) {
        return (
            <div className="text-center py-8">
                <p className="text-muted-foreground">No scan results available</p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* Runtime Info */}
            {nmapResult.runtime && (
                <Card className="bg-muted/30">
                    <CardContent className="pt-6">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                                <p className="text-muted-foreground font-medium">Scan Time</p>
                                <p className="font-mono">{nmapResult.runtime.timestr}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground font-medium">Duration</p>
                                <p className="font-mono">{nmapResult.runtime.elapsed}s</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground font-medium">Status</p>
                                <p className="font-mono capitalize">{nmapResult.runtime.exit}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground font-medium">Version</p>
                                <p className="font-mono">Nmap {nmapResult.stats?.version}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Scan Results by IP */}
            {ips.map(ip => {
                const hostData = nmapResult[ip]
                const ports = hostData.ports || []
                const osMatches = hostData.osmatch || []
                const hostname = hostData.hostname && hostData.hostname.length > 0 ? hostData.hostname[0].name : 'Unknown'
                const openPorts = ports.filter(p => p.state === 'open')
                const closedPorts = ports.filter(p => p.state === 'closed')
                const filteredPorts = ports.filter(p => p.state === 'filtered')

                return (
                    <Card key={ip}>
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center justify-between">
                                <div>
                                    <p className="font-mono text-sm text-muted-foreground">{ip}</p>
                                    <p className="text-base font-normal text-foreground">{hostname}</p>
                                </div>
                                <div className="text-right text-sm font-normal">
                                    <div className="flex gap-4">
                                        <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-medium">
                                            Open: {openPorts.length}
                                        </span>
                                        <span className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-xs font-medium">
                                            Closed: {closedPorts.length}
                                        </span>
                                        <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-xs font-medium">
                                            Filtered: {filteredPorts.length}
                                        </span>
                                    </div>
                                </div>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* OS Detection */}
                            {osMatches.length > 0 && (
                                <div className="border rounded-lg">
                                    <div
                                        className="p-4 cursor-pointer hover:bg-muted/50 flex items-center justify-between"
                                        onClick={toggleOSExpand}
                                    >
                                        <div className="flex items-center space-x-2">
                                            {expandedOS ? (
                                                <ChevronDown className="h-5 w-5" />
                                            ) : (
                                                <ChevronRight className="h-5 w-5" />
                                            )}
                                            <h4 className="font-semibold">OS Detection ({osMatches.length} matches)</h4>
                                        </div>
                                        {osMatches.length > 0 && (
                                            <span className="text-sm bg-blue-100 text-blue-800 px-3 py-1 rounded-full font-medium">
                                                Top: {osMatches[0].name} ({osMatches[0].accuracy}%)
                                            </span>
                                        )}
                                    </div>

                                    {expandedOS && (
                                        <div className="bg-muted/30 p-4 border-t space-y-3">
                                            {osMatches.map((os, idx) => (
                                                <div key={idx} className="bg-background border rounded p-3 text-sm">
                                                    <div className="flex items-start justify-between mb-2">
                                                        <div className="flex-1">
                                                            <p className="font-semibold">{os.name}</p>
                                                            <p className="text-muted-foreground text-xs mt-1">
                                                                Type: {os.osclass?.type} | Vendor: {os.osclass?.vendor}
                                                            </p>
                                                        </div>
                                                        <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-medium whitespace-nowrap ml-2">
                                                            {os.accuracy}%
                                                        </span>
                                                    </div>
                                                    {os.cpe && (
                                                        <p className="text-xs font-mono text-muted-foreground bg-muted p-2 rounded mt-2">
                                                            {os.cpe}
                                                        </p>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Ports Table */}
                            {ports.length > 0 && (
                                <div>
                                    <h4 className="font-semibold mb-3">Ports Scanned ({ports.length})</h4>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                            <tr className="border-b">
                                                <th className="text-left py-3 font-medium">Port</th>
                                                <th className="text-left py-3 font-medium">Service</th>
                                                <th className="text-left py-3 font-medium">State</th>
                                                <th className="text-left py-3 font-medium">Reason</th>
                                                <th className="text-left py-3 font-medium">Details</th>
                                            </tr>
                                            </thead>
                                            <tbody>
                                            {ports.map((port, idx) => {
                                                const portKey = `${ip}-${port.portid}`
                                                return (
                                                    <React.Fragment key={idx}>
                                                        <tr
                                                            className="border-b hover:bg-muted/50"
                                                            onClick={() => togglePortExpand(ip, port.portid)}
                                                            style={{ cursor: 'pointer' }}
                                                        >
                                                            <td className="py-3 font-mono font-semibold">{port.portid}</td>
                                                            <td className="py-3">{port.service?.name || 'unknown'}</td>
                                                            <td className="py-3">
                                                                    <span className={`px-3 py-1 rounded text-xs font-medium inline-flex items-center space-x-1 ${getPortStateColor(port.state)}`}>
                                                                        <span className="capitalize">{port.state}</span>
                                                                    </span>
                                                            </td>
                                                            <td className="py-3 text-xs text-muted-foreground">{port.reason}</td>
                                                            <td className="py-3">
                                                                <div className="flex items-center">
                                                                    {expandedPorts[portKey] ? (
                                                                        <ChevronDown className="h-4 w-4" />
                                                                    ) : (
                                                                        <ChevronRight className="h-4 w-4" />
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                        {expandedPorts[portKey] && (
                                                            <tr className="border-b bg-muted/30">
                                                                <td colSpan="5" className="p-4">
                                                                    <div className="space-y-2 text-sm">
                                                                        <div className="grid grid-cols-2 gap-4">
                                                                            <div>
                                                                                <p className="text-muted-foreground font-medium">Protocol</p>
                                                                                <p className="font-mono capitalize">{port.protocol}</p>
                                                                            </div>
                                                                            <div>
                                                                                <p className="text-muted-foreground font-medium">State</p>
                                                                                <p className="font-mono capitalize">{port.state}</p>
                                                                            </div>
                                                                            <div>
                                                                                <p className="text-muted-foreground font-medium">Service</p>
                                                                                <p className="font-mono">{port.service?.name || 'unknown'}</p>
                                                                            </div>
                                                                            <div>
                                                                                <p className="text-muted-foreground font-medium">Confidence</p>
                                                                                <p className="font-mono">{port.service?.conf || 'N/A'}/10</p>
                                                                            </div>
                                                                        </div>
                                                                        {port.cpe && port.cpe.length > 0 && (
                                                                            <div>
                                                                                <p className="text-muted-foreground font-medium">CPE</p>
                                                                                <div className="space-y-1 mt-1">
                                                                                    {port.cpe.map((c, cIdx) => (
                                                                                        <p key={cIdx} className="font-mono text-xs bg-background border rounded p-2">
                                                                                            {c}
                                                                                        </p>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </React.Fragment>
                                                )
                                            })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )
            })}
        </div>
    )
}

export default NmapTab
