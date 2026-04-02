import React from 'react'
import { Button } from '../ui/button'

const DnsTab = ({ data, loading, error, onRetry }) => {
    if (loading && !data) {
        return (
            <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                <p className="text-muted-foreground mt-2">Fetching DNS records...</p>
            </div>
        )
    }

    if (error) {
        return (
            <div className="text-center py-8">
                <p className="text-red-600 mb-4">Error: {error}</p>
                <Button onClick={onRetry}>
                    Retry DNS Lookup
                </Button>
            </div>
        )
    }

    if (!data) {
        return (
            <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">No DNS data available</p>
                <p className="text-sm text-muted-foreground">
                    Open this tab to fetch DNS records
                </p>
            </div>
        )
    }

    const DnsRecordSection = ({ title, records, type }) => (
        <div className="mb-6">
            <h3 className="font-semibold mb-3 text-lg">{title}</h3>
            {records && records.length > 0 ? (
                <div className="space-y-2">
                    {records.map((record, index) => (
                        <div key={index} className="flex items-center space-x-2 p-2 bg-muted rounded">
                            <span className="font-mono bg-background px-2 py-1 rounded text-xs mt-1">
                                {type}
                            </span>
                            <code className="text-sm flex-1">{record}</code>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-muted-foreground italic">No records found</p>
            )}
        </div>
    )

    return (
        <>
                <DnsRecordSection title="A Records (IPv4)" records={data.a_records} type="A" />
                <DnsRecordSection title="AAAA Records (IPv6)" records={data.aaaa_records} type="AAAA" />
                <DnsRecordSection title="MX Records (Mail)" records={data.mx_records} type="MX" />
                <DnsRecordSection title="NS Records (Name Server)" records={data.ns_records} type="NS" />
                <DnsRecordSection title="TXT Records" records={data.txt_records} type="TXT" />
                <DnsRecordSection title="CNAME Records" records={data.cname_records} type="CNAME" />
        </>
    )
}

export default DnsTab
