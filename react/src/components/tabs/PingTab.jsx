import React from 'react'
import {Button} from '../ui/button'

const PingTab = ({data, loading, error, onRetry}) => {
	if (loading && !data) {
		return (
			<div className="text-center py-8">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
				<p className="text-muted-foreground mt-2">Running ping tests...</p>
			</div>
		)
	}

	if (error) {
		return (
			<div className="text-center py-8">
				<p className="text-red-600 mb-4">Error: {error}</p>
				<Button onClick={onRetry}>
					Retry Ping
				</Button>
			</div>
		)
	}

	if (!data || data.length === 0) {
		return (
			<div className="text-center py-8">
				<p className="text-muted-foreground mb-4">No ping data available</p>
				<p className="text-sm text-muted-foreground">
					Open this tab to run ping test
				</p>
			</div>
		)
	}

	return (
			<div className="overflow-x-auto">
				<table className="w-full text-sm">
					<thead>
					<tr className="border-b">
						<th className="text-left py-3 font-medium min-w-56">Location</th>
						<th className="text-left py-3 font-medium min-w-20">Status</th>
						<th className="text-left py-3 font-medium min-w-20">Packets</th>
						<th className="text-left py-3 font-medium min-w-20">Packet Loss</th>
						<th className="text-left py-3 font-medium min-w-20">Min Time</th>
						<th className="text-left py-3 font-medium min-w-20">Avg Time</th>
						<th className="text-left py-3 font-medium min-w-20">Max Time</th>
						<th className="text-left py-3 font-medium min-w-20">IP Address</th>
					</tr>
					</thead>
					<tbody>
					{data.map((result, index) => (
						<tr key={index} className="border-b hover:bg-muted/50">
							<td className="py-3">{result.location}</td>
							<td className="py-3">
                                    <span className={`px-2 py-1 rounded text-xs ${
	                                    !result.is_failed && result.packetsSent === 0 ? 'bg-amber-200 text-amber-700' : result.is_failed
		                                    ? 'bg-red-100 text-red-800'
		                                    : 'bg-green-100 text-green-800'
                                    }`}>
                                        {!result.is_failed && result.packetsSent === 0 ? 'Pending' : result.is_failed ? 'Failed' : 'Success'}
                                    </span>
							</td>
							<td className="py-3">
								{result.packetsReceived}/{result.packetsSent}
							</td>
							<td className="py-3">
                    <span className={`px-2 py-1 rounded text-xs ${
	                    result.packetLoss === '0%'
		                    ? 'bg-green-100 text-green-800'
		                    : 'bg-red-100 text-red-800'
                    }`}>
                      {result.packetLoss}
                    </span>
							</td>
							<td className="py-3">{result.minTime}</td>
							<td className="py-3 font-medium">{result.avgTime}</td>
							<td className="py-3">{result.maxTime}</td>
							<td className="py-3 font-mono">{result.ip}</td>
						</tr>
					))}
					</tbody>
				</table>
			</div>
	)
}

export default PingTab
