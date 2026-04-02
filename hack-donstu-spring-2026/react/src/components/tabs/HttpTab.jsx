import React, { useState } from 'react'
import { Button } from '../ui/button'
import { ChevronDown, ChevronRight, FileText } from 'lucide-react'

const HttpTab = ({ data, loading, error, onRetry }) => {
    const [expandedRows, setExpandedRows] = useState({})

    const toggleRow = (index) => {
        setExpandedRows(prev => ({
            ...prev,
            [index]: !prev[index]
        }))
    }

    const formatHeaders = (headers) => {
        if (!headers) return null
        return Object.entries(headers).map(([key, value]) => (
            <div key={key} className="flex text-sm py-1 border-b border-muted last:border-b-0">
                <span className="font-medium text-muted-foreground w-1/3">{key}:</span>
                <span className="flex-1 font-mono text-xs break-all">{value}</span>
            </div>
        ))
    }

    if (loading && !data) {
        return (
            <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                <p className="text-muted-foreground mt-2">Running HTTP(S) checks...</p>
            </div>
        )
    }

    if (error) {
        return (
            <div className="text-center py-8">
                <p className="text-red-600 mb-4">Error: {error}</p>
                <Button onClick={onRetry}>
                    Retry HTTP Check
                </Button>
            </div>
        )
    }

    if (!data || data.length === 0) {
        return (
            <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">No HTTP(S) data available</p>
                <p className="text-sm text-muted-foreground">
                    Open this tab to run HTTP(S) check
                </p>
            </div>
        )
    }

    return (
        <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                        <tr className="border-b">
                            <th className="text-left py-3 font-medium">Location</th>
                            <th className="text-left py-3 font-medium">Result</th>
                            <th className="text-left py-3 font-medium">Code</th>
                            <th className="text-left py-3 font-medium">SSL</th>
                            <th className="text-left py-3 font-medium">Headers</th>
                        </tr>
                        </thead>
                        <tbody>
                        {data.map((result, index) => (
                            <React.Fragment key={index}>
                                <tr
                                    className="border-b hover:bg-muted/50 cursor-pointer"
                                    onClick={() => toggleRow(index)}
                                >
                                    <td className="py-3">{result.location}</td>
                                    <td className="py-3">
                                        <span className={`px-2 py-1 rounded text-xs ${
                                            result.result === 'Success' 
                                                ? 'bg-green-100 text-green-800'
                                                : result.result === 'Failed' ? 'bg-red-100 text-red-800' : 'bg-amber-200 text-amber-700'
                                        }`}>
                                            {result.result}
                                        </span>
                                    </td>
                                    <td className="py-3 font-mono">{result.code}</td>
                                    <td className="py-3">
                                        {result.ssl ? (
                                            <span className="text-green-600">✓</span>
                                        ) : (
                                            <span className="text-red-600">✗</span>
                                        )}
                                    </td>
                                    <td className="py-3">
                                        <div className="flex items-center space-x-2">
                                            <FileText className="h-4 w-4 text-muted-foreground" />
                                            {expandedRows[index] ? (
                                                <ChevronDown className="h-4 w-4" />
                                            ) : (
                                                <ChevronRight className="h-4 w-4" />
                                            )}
                                        </div>
                                    </td>
                                </tr>
                                {expandedRows[index] && (
                                    <tr className="border-b bg-muted/30">
                                        <td colSpan="7" className="p-4">
                                            <div className="space-y-3">
                                                <div className="flex items-center space-x-2 text-sm font-medium">
                                                    <FileText className="h-4 w-4" />
                                                    <span>Response Headers</span>
                                                </div>
                                                <div className="bg-background border rounded-lg p-4">
                                                    {result.headers ? (
                                                        <div className="space-y-1">
                                                            {formatHeaders(result.headers)}
                                                        </div>
                                                    ) : (
                                                        <div className="text-center text-muted-foreground py-4">
                                                            No headers available
                                                        </div>
                                                    )}
                                                </div>
                                                {result.server && (
                                                    <div className="text-sm">
                                                        <span className="font-medium text-muted-foreground">Server: </span>
                                                        <span className="font-mono">{result.server}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        ))}
                        </tbody>
                    </table>
                </div>
    )
}

export default HttpTab
