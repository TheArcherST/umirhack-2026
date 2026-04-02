import React, {useState} from 'react'
import {Card, CardContent, CardHeader, CardTitle} from './ui/card'
import {Input} from './ui/input'

const AdvancedOptionsPanel = ({
                                  checkType,
                                  advancedOptions,
                                  updateAdvancedOption,
                                  specificPorts,
                                  updateSpecificPorts
                              }) => {
    const [isExpanded, setIsExpanded] = useState(false)

    const renderCheckbox = (category, option, label, disabled = false) => (
        <label
            className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 p-2 rounded transition">
            <input
                type="checkbox"
                checked={advancedOptions[category][option]}
                onChange={(e) => updateAdvancedOption(category, option, e.target.checked)}
                disabled={disabled}
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <span className={`text-sm ${disabled ? 'text-gray-400' : ''}`}>{label}</span>
        </label>
    )

    const renderNumberInput = (category, option, label, min = 1) => (
        <div className="flex items-center gap-3">
            <label className="text-sm font-medium min-w-[140px]">{label}:</label>
            <Input
                type="number"
                min={min}
                value={advancedOptions[category][option]}
                onChange={(e) => updateAdvancedOption(category, option, parseInt(e.target.value))}
                className="w-24"
            />
        </div>
    )

    const renderPortInput = (type, label) => (
        <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                </svg>
                {label}
            </label>
            <Input
                placeholder="e.g., 80,443,8080"
                value={specificPorts[type]}
                onChange={(e) => updateSpecificPorts(type, e.target.value)}
                className="border-2"
            />
        </div>
    )

    if (checkType === 'all') {
        return (
            <Card className="border-2 border-blue-200 dark:border-blue-800">
                <CardHeader
                    className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    <CardTitle className="text-lg flex items-center justify-between">
                        <span className="flex items-center gap-2">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                            </svg>
                            Advanced Options
                        </span>
                        <svg
                            className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                        </svg>
                    </CardTitle>
                </CardHeader>
                {isExpanded && (
                    <CardContent className="space-y-6 pt-6">
                        {/* HTTP Options */}
                        <div className="space-y-3 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                            <h4 className="font-semibold text-sm flex items-center gap-2">
                                <span className="text-xl">🌐</span> HTTP/HTTPS Options
                            </h4>
                            {renderPortInput('http', 'HTTP/HTTPS Ports')}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {renderCheckbox('http', 'followRedirects', 'Follow Redirects')}
                                {renderCheckbox('http', 'checkSSL', 'Check SSL Certificate')}
                                {renderCheckbox('http', 'checkHeaders', 'Analyze Headers')}
                            </div>
                            {renderNumberInput('http', 'timeout', 'Timeout (seconds)')}
                        </div>

                        {/* TCP/Port Options */}
                        <div className="space-y-3 p-4 bg-purple-50 dark:bg-purple-950 rounded-lg">
                            <h4 className="font-semibold text-sm flex items-center gap-2">
                                <span className="text-xl">🔌</span> TCP/Port Scanning Options
                            </h4>
                            {renderPortInput('tcp', 'TCP Ports to Scan')}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {renderCheckbox('tcp', 'useNmap', 'Use Nmap Scanning')}
                                {renderCheckbox('tcp', 'detectService', 'Detect Services')}
                                {renderCheckbox('tcp', 'scanVulnerabilities', 'Scan for Vulnerabilities', !advancedOptions.tcp.useNmap)}
                                {renderCheckbox('tcp', 'scanRange', 'Scan Port Range')}
                            </div>
                            {advancedOptions.tcp.scanRange && (
                                <Input
                                    placeholder="Port range (e.g., 1-1000)"
                                    value={advancedOptions.tcp.portRange}
                                    onChange={(e) => updateAdvancedOption('tcp', 'portRange', e.target.value)}
                                />
                            )}
                        </div>

                        {/* Ping Options */}
                        <div className="space-y-3 p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                            <h4 className="font-semibold text-sm flex items-center gap-2">
                                <span className="text-xl">📡</span> Ping Options
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {renderNumberInput('ping', 'count', 'Packet Count')}
                                {renderNumberInput('ping', 'packetSize', 'Packet Size (bytes)', 32)}
                            </div>
                        </div>

                        {/* DNS Options */}
                        <div className="space-y-3 p-4 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
                            <h4 className="font-semibold text-sm flex items-center gap-2">
                                <span className="text-xl">🗂️</span> DNS Options
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {renderCheckbox('dns', 'getAllRecords', 'Get All Record Types')}
                                {renderCheckbox('dns', 'checkDNSSEC', 'Check DNSSEC')}
                                {renderCheckbox('dns', 'reverseLookup', 'Reverse DNS Lookup')}
                                {renderCheckbox('dns', 'checkPropagation', 'Check DNS Propagation')}
                            </div>
                        </div>

                        {/* Traceroute Options */}
                        <div className="space-y-3 p-4 bg-red-50 dark:bg-red-950 rounded-lg">
                            <h4 className="font-semibold text-sm flex items-center gap-2">
                                <span className="text-xl">🛣️</span> Traceroute Options
                            </h4>
                            {renderNumberInput('traceroute', 'maxHops', 'Max Hops')}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {renderCheckbox('traceroute', 'showGeolocation', 'Show Geolocation')}
                                {renderCheckbox('traceroute', 'resolveHostnames', 'Resolve Hostnames')}
                            </div>
                        </div>

                        {/* Security Options */}
                        <div className="space-y-3 p-4 bg-orange-50 dark:bg-orange-950 rounded-lg">
                            <h4 className="font-semibold text-sm flex items-center gap-2">
                                <span className="text-xl">🔒</span> Security Options
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {renderCheckbox('security', 'checkFirewall', 'Detect Firewall/WAF')}
                                {renderCheckbox('security', 'checkOpenPorts', 'Security Port Scan')}
                            </div>
                            {advancedOptions.security.checkOpenPorts && (
                                <Input
                                    placeholder="Port range for security scan"
                                    value={advancedOptions.security.portScanRange}
                                    onChange={(e) => updateAdvancedOption('security', 'portScanRange', e.target.value)}
                                />
                            )}
                        </div>
                    </CardContent>
                )}
            </Card>
        )
    }

    return (
        <Card className="border-2 border-blue-200 dark:border-blue-800">
            <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                    </svg>
                    Options for {checkType.toUpperCase()}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {checkType === 'http' && (
                    <div className="space-y-3">
                        {renderPortInput('http', 'Ports to Check')}
                        {renderCheckbox('http', 'followRedirects', 'Follow Redirects')}
                        {renderCheckbox('http', 'checkSSL', 'Check SSL Certificate')}
                        {renderCheckbox('http', 'checkHeaders', 'Analyze Security Headers')}
                        {renderNumberInput('http', 'timeout', 'Timeout (seconds)')}
                    </div>
                )}

                {checkType === 'ping' && (
                    <div className="space-y-3">
                        {renderNumberInput('ping', 'count', 'Packet Count')}
                        {renderNumberInput('ping', 'packetSize', 'Packet Size (bytes)', 32)}
                        {renderNumberInput('ping', 'timeout', 'Timeout (seconds)')}
                    </div>
                )}

                {checkType === 'tcp' && (
                    <div className="space-y-3">
                        {renderPortInput('tcp', 'Ports to Scan')}
                        {renderCheckbox('tcp', 'useNmap', 'Use Nmap Scanning')}
                        {renderCheckbox('tcp', 'detectService', 'Detect Services')}
                        {renderCheckbox('tcp', 'scanVulnerabilities', 'Scan for Vulnerabilities', !advancedOptions.tcp.useNmap)}
                        {renderCheckbox('tcp', 'scanRange', 'Scan Port Range')}
                        {advancedOptions.tcp.scanRange && (
                            <Input
                                placeholder="Port range (e.g., 1-1000)"
                                value={advancedOptions.tcp.portRange}
                                onChange={(e) => updateAdvancedOption('tcp', 'portRange', e.target.value)}
                            />
                        )}
                    </div>
                )}

                {checkType === 'dns' && (
                    <div className="space-y-3">
                        {renderCheckbox('dns', 'getAllRecords', 'Get All Record Types')}
                        {renderCheckbox('dns', 'checkDNSSEC', 'Check DNSSEC Validation')}
                        {renderCheckbox('dns', 'reverseLookup', 'Reverse DNS Lookup')}
                        {renderCheckbox('dns', 'checkPropagation', 'Check DNS Propagation')}
                    </div>
                )}

                {checkType === 'traceroute' && (
                    <div className="space-y-3">
                        {renderNumberInput('traceroute', 'maxHops', 'Max Hops')}
                        {renderCheckbox('traceroute', 'showGeolocation', 'Show Geolocation Data')}
                        {renderCheckbox('traceroute', 'resolveHostnames', 'Resolve Hostnames')}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

export default AdvancedOptionsPanel
