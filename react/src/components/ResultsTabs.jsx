import React, { useState, useEffect, useCallback } from 'react'
import { Button } from './ui/button'
import { RefreshCw } from 'lucide-react'
import InfoTab from './tabs/InfoTab'
import HttpTab from './tabs/HttpTab'
import PingTab from './tabs/PingTab'
import TcpTab from './tabs/TcpTab'
import UdpTab from './tabs/UdpTab'
import DnsTab from './tabs/DnsTab'
import TracerouteTab from "./tabs/TracerouteTab.jsx"
import NmapTab from "./tabs/NmapTab.jsx"
import { debounce } from '../lib/debounce.js'
import {useAuthContext} from "../contexts/AuthContext.jsx";

const ResultsTabs = ({ results, onFetchTabData }) => {
    const [activeTab, setActiveTab] = useState('info')
    const [loadingTabs, setLoadingTabs] = useState({})
    const [tabErrors, setTabErrors] = useState({})
    const [tabData, setTabData] = useState({
        info: results.info,
        http: results.http,
        ping: results.ping,
        tcp: results.tcp,
        udp: results.udp,
        dns: results.dns,
        traceroute: results.traceroute,
        nmap: results.nmap
    })
    const [retryCounts, setRetryCounts] = useState({})
    const { isAuthenticated } = useAuthContext()

    // Сброс при новом запросе
    useEffect(() => {
        setTabData({
            info: results.info,
            http: results.http,
            ping: results.ping,
            tcp: results.tcp,
            udp: results.udp,
            dns: results.dns,
            traceroute: results.traceroute,
            nmap: results.nmap
        })
        setLoadingTabs({})
        setTabErrors({})
        setRetryCounts({}) // Сбрасываем счетчики попыток
        // Убираем автоматическое переключение на первую вкладку

        // Автоматически загружаем данные для активной вкладки при первом отображении
        if (results && results.checkUids && results.checkUids.geoip) {
            handleTabChange(activeTab)
        }
    }, [results])

    const tabs = [
        { id: 'info', label: 'Basic Info', component: InfoTab },
        { id: 'http', label: 'HTTP(S)', component: HttpTab },
        { id: 'ping', label: 'Ping', component: PingTab },
        { id: 'traceroute', label: 'Traceroute', component: TracerouteTab },
        { id: 'tcp', label: 'TCP', component: TcpTab },
        { id: 'udp', label: 'UDP', component: UdpTab },
        { id: 'dns', label: 'DNS', component: DnsTab },
        ...(isAuthenticated ? [{ id: 'nmap', label: 'Nmap', component: NmapTab }] : [])
    ]

    const handleTabChange = async (tabId) => {
        setActiveTab(tabId)

        if (tabData[tabId] !== null) return

        setLoadingTabs(prev => ({ ...prev, [tabId]: true }))
        setTabErrors(prev => ({ ...prev, [tabId]: null }))

        try {
            const data = await onFetchTabData(tabId)
            setTabData(prev => ({ ...prev, [tabId]: data }))
        } catch (error) {
            setTabErrors(prev => ({
                ...prev,
                [tabId]: error.message || 'Failed to fetch data'
            }))
        } finally {
            setLoadingTabs(prev => ({ ...prev, [tabId]: false }))
        }
    }

    useEffect(() => {
        const currentTabData = tabData[activeTab]
        const currentRetryCount = retryCounts[activeTab] || 0

        if (currentTabData === null &&
            !tabErrors[activeTab] &&
            !loadingTabs[activeTab] &&
            currentRetryCount < 10) {

            const timer = setTimeout(() => {
                console.log(`Auto-refreshing tab ${activeTab} after 1.5s (attempt ${currentRetryCount + 1}/10)`)

                setRetryCounts(prev => ({ ...prev, [activeTab]: currentRetryCount + 1 }))
                
                handleTabChange(activeTab)
            }, 1500)

            return () => clearTimeout(timer)
        } else if (currentRetryCount >= 10) {
            console.log(`Tab ${activeTab} reached maximum retry attempts (10/10). Auto-refresh stopped.`)
        }
    }, [activeTab, tabData, tabErrors, loadingTabs, retryCounts])

    const handleRetry = (tabId) => {
        setTabData(prev => ({ ...prev, [tabId]: null }))
        setTabErrors(prev => ({ ...prev, [tabId]: null }))
        setRetryCounts(prev => ({ ...prev, [tabId]: 0 })) // Сбрасываем счетчик при ручном retry
        handleTabChange(tabId)
    }

    const handleRefresh = async (tabId) => {
        setLoadingTabs(prev => ({ ...prev, [tabId]: true }))
        setTabErrors(prev => ({ ...prev, [tabId]: null }))

        try {
            const data = await onFetchTabData(tabId)
            setTabData(prev => ({ ...prev, [tabId]: data }))

            // Сбрасываем счетчик попыток при успешной загрузке
            if (data !== null) {
                setRetryCounts(prev => ({ ...prev, [tabId]: 0 }))
            }
        } catch (error) {
            setTabErrors(prev => ({
                ...prev,
                [tabId]: error.message || 'Failed to fetch data'
            }))
        } finally {
            setLoadingTabs(prev => ({ ...prev, [tabId]: false }))
        }
    }

    // Debounced version of handleRefresh (300ms delay)
    const debouncedRefresh = useCallback(
        debounce((tabId) => {
            handleRefresh(tabId);
        }, 300),
        [onFetchTabData]
    );


    const activeTabData = tabs.find(tab => tab.id === activeTab)

    return (
        <div>
            <div className="relative">
                {/* Refresh Button - Above on mobile */}
                {activeTabData && (
                    <div className="flex justify-end px-4 py-2 md:hidden border-b">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => debouncedRefresh(activeTabData.id)}
                            disabled={loadingTabs[activeTabData.id]}
                            className="flex items-center space-x-2"
                        >
                            <RefreshCw className={`h-4 w-4 ${loadingTabs[activeTabData.id] ? 'animate-spin' : ''}`} />
                            <span>Refresh</span>
                        </Button>
                    </div>
                )}
                {/* Tab Headers */}
                <div className="relative">
                    <div className="flex items-center border-b overflow-x-auto scrollbar-hide">
                        {tabs.map(tab => (
                            <div
                                key={tab.id}
                                className={`flex items-center border-b-2 transition-colors ${
                                    activeTab === tab.id
                                        ? 'border-primary text-primary'
                                        : 'border-transparent text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                <button
                                    onClick={() => handleTabChange(tab.id)}
                                    className="flex items-center px-6 py-3 text-sm font-medium whitespace-nowrap"
                                >
                                    {tab.label}
                                    {loadingTabs[tab.id] && (
                                        <span className="ml-2 w-2 h-2 bg-primary rounded-full animate-pulse" />
                                    )}
                                    {tabErrors[tab.id] && (
                                        <span className="ml-2 w-2 h-2 bg-red-500 rounded-full" />
                                    )}
                                </button>
                            </div>
                        ))}
                        {activeTabData && (
                            <div className="hidden md:flex ml-auto mr-4">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => debouncedRefresh(activeTabData.id)}
                                    disabled={loadingTabs[activeTabData.id]}
                                    className="flex items-center space-x-2"
                                >
                                    <RefreshCw className={`h-4 w-4 ${loadingTabs[activeTabData.id] ? 'animate-spin' : ''}`} />
                                    <span>Refresh</span>
                                </Button>
                            </div>
                        )}
                    </div>
                    {/* Fixed gradient overlay - positioned relative to the outer container */}
                    <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none z-10 md:hidden"></div>
                </div>
            </div>

            {/* Tab Content */}
            <div className="p-6">
                {activeTabData && (
                    <activeTabData.component
                        data={tabData[activeTabData.id]}
                        loading={loadingTabs[activeTabData.id]}
                        error={tabErrors[activeTabData.id]}
                        onRetry={() => handleRetry(activeTabData.id)}
                        target={results.target}
                        port={results.port}
                    />
                )}
            </div>
        </div>
    )
}

export default ResultsTabs
