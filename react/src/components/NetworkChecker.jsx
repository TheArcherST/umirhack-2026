import React, {useState, useRef} from 'react'
import {Card} from './ui/card'
import {Button} from './ui/button'
import {Input} from './ui/input'
import ResultsTabs from './ResultsTabs'
import {Scan, ArrowDown, RefreshCw} from 'lucide-react'
import {apiService} from "../services/api.js";


const NetworkChecker = () => {
    const [target, setTarget] = useState('')
    const [port, setPort] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [results, setResults] = useState(null)
    const [resultsKey, setResultsKey] = useState(0)
    const [targetError, setTargetError] = useState('')
    const portInputRef = useRef(null)

    const validateInput = (input) => {
        const urlPattern = /^(https?:\/\/)?([\w\-]+\.)+[\w\-]+(\/[\w\-._~:/?#[\]@!$&'()*+,;=]*)?$/i;
        const ipPattern = /^(25[0-5]|2[0-4]\d|[01]?\d\d?)\.(25[0-5]|2[0-4]\d|[01]?\d\d?)\.(25[0-5]|2[0-4]\d|[01]?\d\d?)\.(25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
        const domainPattern = /^([\w\d-]+\.)+[\w]{2,}$/i;

        if (urlPattern.test(input)) {
            if (/^https?:\/\//i.test(input)) {
                return 'url';
            } else if (ipPattern.test(input)) {
                return 'ip';
            } else if (domainPattern.test(input)) {
                return 'domain';
            }
        }
        return 'string';
    }

    const normalizeInput = (input) => {
        const trimmedInput = input.trim();
        
        // Если это IP адрес, возвращаем как есть
        const ipPattern = /^(25[0-5]|2[0-4]\d|[01]?\d\d?)\.(25[0-5]|2[0-4]\d|[01]?\d\d?)\.(25[0-5]|2[0-4]\d|[01]?\d\d?)\.(25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
        if (ipPattern.test(trimmedInput)) {
            return trimmedInput;
        }
        
        // Если это домен без протокола, добавляем https://
        const domainPattern = /^([\w\d-]+\.)+[\w]{2,}$/i;
        if (domainPattern.test(trimmedInput)) {
            return `https://${trimmedInput}`;
        }
        
        // Если уже есть протокол, возвращаем как есть
        if (/^https?:\/\//i.test(trimmedInput)) {
            return trimmedInput;
        }
        
        // Для остальных случаев возвращаем как есть
        return trimmedInput;
    }


    const handleTargetChange = (e) => {
        const value = e.target.value
        setTarget(value)
        setTargetError('')
    }

    const handlePortChange = (e) => {
        const value = e.target.value.replace(/\D/g, '')
        setPort(value)
    }

    const handleCheck = async () => {
        if (!target.trim()) {
            setTargetError('Please enter a target URL or IP address')
            return
        }

        // Нормализуем ввод (добавляем https:// если нужно)
        const normalizedTarget = normalizeInput(target);
        const targetType = validateInput(normalizedTarget);

        if (targetType === 'string') {
            setTargetError('Please enter a valid URL or IP address')
            return
        }

        if (port && (parseInt(port) < 1 || parseInt(port) > 65535)) {
            setTargetError('Port must be between 1 and 65535')
            return
        }

        setIsLoading(true)
        setResults(null)
        setResultsKey(prev => prev + 1);

        try {
            // Создаем только базовую проверку (GeoIP для Basic Info)
            const geoipCheck = await apiService.createGeoIPCheck(normalizedTarget);
            
            console.log('Initial check result:', geoipCheck);

            // Инициализируем результаты с базовой информацией
            setResults({
                target: normalizedTarget, // Используем нормализованный target
                originalTarget: target, // Сохраняем оригинальный ввод пользователя
                port: port || 'N/A',
                timestamp: new Date().toISOString(),
                checkUids: {
                    geoip: geoipCheck.uid, // Сохраняем UID базовой проверки
                    http: null,
                    ping: null,
                    tcp: null,
                    udp: null,
                    dns: null,
                    traceroute: null,
                },
                info: null,
                http: null,
                ping: null,
                tcp: null,
                udp: null,
                dns: null,
                traceroute: null,
            });

            setIsLoading(false);
        } catch (error) {
            console.error('Error creating initial check:', error);
            setTargetError('Failed to create initial check. Please try again.');
            setIsLoading(false);
        }
    }

    const handleFetchTabData = async (tabId) => {
        if (!results || !results.checkUids) {
            console.log('No results or checkUids available');
            return null;
        }

        console.log(`Fetching data for tab: ${tabId}`, results.checkUids);

        try {
            let checkUid = results.checkUids[tabId];
            let checkType = null;

            // Если проверка еще не создана, создаем её
            if (!checkUid) {
                console.log(`Creating new check for tab: ${tabId}`);
                
                switch (tabId) {
                    case "info":
                        // GeoIP уже создан при инициализации
                        checkUid = results.checkUids.geoip;
                        checkType = "geoip";
                        break;
                    case "http":
                        const httpCheck = await apiService.createHTTPCheck(results.target);
                        checkUid = httpCheck.uid;
                        checkType = "http";
                        // Обновляем результаты с новым UID
                        setResults(prev => ({
                            ...prev,
                            checkUids: { ...prev.checkUids, http: checkUid }
                        }));
                        break;
                    case "ping":
                        const pingCheck = await apiService.createPingCheck(results.target);
                        checkUid = pingCheck.uid;
                        checkType = "ping";

                        setResults(prev => ({
                            ...prev,
                            checkUids: { ...prev.checkUids, ping: checkUid },
                        }));

                        break;
                    case "traceroute":
                        const tracerouteCheck = await apiService.createTracerouteCheck(results.target);
                        checkUid = tracerouteCheck.uid;
                        checkType = "traceroute";
                        setResults(prev => ({
                            ...prev,
                            checkUids: { ...prev.checkUids, traceroute: checkUid }
                        }));
                        break;
                    case "tcp":
                        if (results.port && results.port !== 'N/A') {
                            const tcpCheck = await apiService.createTCPUDPCheck(results.target, parseInt(results.port), "tcp");
                            checkUid = tcpCheck.uid;
                            checkType = "tcp_and_udp";
                            setResults(prev => ({
                                ...prev,
                                checkUids: { ...prev.checkUids, tcp: checkUid }
                            }));
                        } else {
                            console.log('No port specified, TCP check not available');
                            return null;
                        }
                        break;
                    case "udp":
                        if (results.port && results.port !== 'N/A') {
                            const udpCheck = await apiService.createTCPUDPCheck(results.target, parseInt(results.port), "udp");
                            checkUid = udpCheck.uid;
                            checkType = "tcp_and_udp";
                            setResults(prev => ({
                                ...prev,
                                checkUids: { ...prev.checkUids, udp: checkUid }
                            }));
                        } else {
                            console.log('No port specified, UDP check not available');
                            return null;
                        }
                        break;
                    case "dns":
                        const dnsCheck = await apiService.createDNSCheck(results.target);
                        checkUid = dnsCheck.uid;
                        checkType = "dns";
                        setResults(prev => ({
                            ...prev,
                            checkUids: { ...prev.checkUids, dns: checkUid }
                        }));
                        break;
                    case "nmap":
                        const nmapCheck = await apiService.createNmapCheck(results.target, results.port)
                        checkUid = nmapCheck.uid;
                        checkType = "nmap";
                        setResults(prev => ({
                            ...prev,
                            checkUids: { ...prev.checkUids, nmap: checkUid }
                        }));
                        break;
                    default:
                        return null;
                }
            } else {
                // Определяем тип проверки для существующего UID
                switch (tabId) {
                    case "info":
                        checkType = "geoip";
                        break;
                    case "http":
                        checkType = "http";
                        break;
                    case "ping":
                        checkType = "ping";
                        break;
                    case "traceroute":
                        checkType = "traceroute";
                        break;
                    case "tcp":
                    case "udp":
                        checkType = "tcp_and_udp";
                        break;
                    case "dns":
                        checkType = "dns";
                        break;
                    case "nmap":
                        checkType = "nmap";
                        break;
                    default:
                        return null;
                }
            }

            if (!checkUid) {
                console.warn(`No check UID found for tab: ${tabId}`);
                return null;
            }

            const checkData = await apiService.getCheck(checkUid);

            return processCheckData(checkData, checkType, tabId);
        } catch (error) {
            console.error(`Error fetching data for tab ${tabId}:`, error);
            throw error;
        }
    }

    const processCheckData = (checkData, checkType, tabId) => {
        console.log(`Processing check data for ${tabId}:`, checkData);
        
        if (!checkData || !checkData.tasks || checkData.tasks.length === 0) {
            console.log(`No tasks found in check data for ${tabId}`);
            return null;
        }

        // Находим все задачи с нужным типом
        const tasks = checkData.tasks.filter(t => t.payload && t.payload.type === checkType);
        if (!tasks || tasks.length === 0) {
            console.log(`No tasks found for type ${checkType} in ${tabId}`);
            return null;
        }

        console.log(`Found ${tasks.length} tasks for ${tabId}:`, tasks);

        // Преобразуем данные в формат, ожидаемый компонентами вкладок
        switch (tabId) {
            case "info":
                return processGeoIPData(tasks);
            case "http":
                return processHTTPData(tasks);
            case "ping":
                return processPingData(tasks);
            case "traceroute":
                return processTracerouteData(tasks);
            case "tcp":
                return processTCPData(tasks);
            case "udp":
                return processUDPData(tasks);
            case "dns":
                return processDNSData(tasks);
            case "nmap":
                return processNmapData(tasks);
            default:
                return tasks;
        }
    }

    // Обработчики для каждого типа данных
    const processGeoIPData = (tasks) => {
        if (!tasks || tasks.length === 0) return null;
        
        // Обрабатываем данные от всех агентов
        return tasks.map((task, index) => {
            const result = task.result;
            const agentName = task.bound_to_agent?.name || `Agent ${index + 1}`;
            
            if (!result || !result.items || result.items.length === 0) {
                return {
                    agent: agentName,
                    ip: 'N/A',
                    hostname: 'N/A',
                    ipRange: 'N/A',
                    asn: 'N/A',
                    isp: 'N/A',
                    country: 'N/A',
                    region: 'N/A',
                    city: 'N/A',
                    postalCode: 'N/A',
                    timezone: 'N/A',
                    localTime: new Date().toLocaleString(),
                    coordinates: { lat: 0, lng: 0 },
                    is_failed: task.is_failed
                };
            }
            
            const item = result.items[0]; // Берем первый элемент из items
            return {
                agent: agentName,
                ip: item.ip || 'N/A',
                hostname: item.hostname || 'N/A',
                ipRange: item.ipRange || 'N/A',
                asn: item.asn || 'N/A',
                isp: item.organization || 'N/A',
                country: item.country || 'N/A',
                region: item.region || 'N/A',
                city: item.city || 'N/A',
                postalCode: item.postal_code || 'N/A',
                timezone: item.time_zone || 'N/A',
                localTime: new Date().toLocaleString(),
                coordinates: {
                    lat: item.latitude || 0,
                    lng: item.longitude || 0
                },
                is_failed: task.is_failed
            };
        });
    }

    const processHTTPData = (tasks) => {
        if (!tasks || tasks.length === 0) return null;
        
        return tasks.map((task, index) => {
            const result = task.result;
            const agentName = task.bound_to_agent?.name || `Agent ${index + 1}`;

            return {
                location: agentName,
                result: task.is_failed ? 'Failed' : result ? 'Success' : 'Pending',
                code: result?.status_code || 'N/A',
                url: result?.final_url || 'N/A',
                ssl: result?.final_url && result.final_url.startsWith('https://'),
                headers: result?.headers || {},
                server: result?.headers?.Server || 'N/A'
            };
        });
    }

    const processPingData = (tasks) => {
        if (!tasks || tasks.length === 0) return null;
        
        return tasks.map((task, index) => {
            const result = task.result;
            const agentName = task.bound_to_agent?.name || `Agent ${index + 1}`;
            
            return {
                location: agentName,
                packetsSent: result?.total || 0,
                packetsReceived: result?.live || 0,
                packetLoss: result?.total ? `${Math.round(((result.total - (result.live || 0)) / result.total) * 100)}%` : 'N/A',
                minTime: result?.min_delay ? `${result.min_delay.toFixed(2)}ms` : 'N/A',
                avgTime: result?.average_delay ? `${result.average_delay.toFixed(2)}ms` : 'N/A',
                maxTime: result?.max_delay ? `${result.max_delay.toFixed(2)}ms` : 'N/A',
                ip: result?.ip || 'N/A',
                is_failed: task.is_failed
            };
        });
    }

    const processTracerouteData = (tasks) => {
        if (!tasks || tasks.length === 0) return null;
        
        // Для traceroute возвращаем данные от первого агента
        const firstTask = tasks[0];
        const result = firstTask?.result;
        
        // Если нет hops или hops пустой, возвращаем null для продолжения автообновления
        if (!result?.hops || result.hops.length === 0) {
            return null;
        }
        
        return {
            target: result?.destination || 'N/A',
            hops: result?.hops || [],
            error: result?.error || null,
            is_failed: firstTask.is_failed
        };
    }

    const processTCPData = (tasks) => {
        if (!tasks || tasks.length === 0) return null;
        
        return tasks.map((task, index) => {
            const result = task.result;
            const agentName = task.bound_to_agent?.name || `Agent ${index + 1}`;
            
            return {
                location: agentName,
                port: result?.port || 'N/A',
                protocol: result?.protocol || 'tcp',
                reachable: task.is_failed ? false : (result?.reachable || false),
                latency: result?.latency_ms ? `${result.latency_ms.toFixed(2)}ms` : 'N/A',
                ip: result?.ip || 'N/A',
                is_failed: task.is_failed
            };
        });
    }

    const processUDPData = (tasks) => {
        if (!tasks || tasks.length === 0) return null;
        
        return tasks.map((task, index) => {
            const result = task.result;
            const agentName = task.bound_to_agent?.name || `Agent ${index + 1}`;
            
            return {
                location: agentName,
                port: result?.port || 'N/A',
                protocol: result?.protocol || 'udp',
                reachable: task.is_failed ? false : (result?.reachable || false),
                latency: result?.latency_ms ? `${result.latency_ms.toFixed(2)}ms` : 'N/A',
                ip: result?.ip || 'N/A',
                is_failed: task.is_failed
            };
        });
    }

    const processDNSData = (tasks) => {
        if (!tasks || tasks.length === 0) return null;
        
        // Для DNS возвращаем данные от первого агента
        const firstTask = tasks[0];
        const result = firstTask?.result;
        
        return {
            a_records: result?.a_records || [],
            aaaa_records: result?.aaaa_records || [],
            mx_records: result?.mx_records || [],
            ns_records: result?.ns_records || [],
            cname_records: result?.cname_records || [],
            txt_records: result?.txt_records || [],
            is_failed: firstTask.is_failed
        };
    }

    const processNmapData = (tasks) => {
        if (!tasks || tasks.length === 0) return null;

        const taskWithResult = tasks.find(task => task.result !== null);

        return taskWithResult ? taskWithResult.result : null;
    }

    const handleTargetKeyPress = (e) => {
        if (e.key === 'Enter') {
            handleCheck()
        }
    }

    const handlePortKeyPress = (e) => {
        if (e.key === 'Enter') {
            handleCheck()
        }
    }

    const EmptyResultsPlaceholder = () => (
        <Card className="mt-4 mb-10">
            <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-8">
                <div className="max-w-lg mx-auto space-y-6">
                    <div className="relative">
                        <Scan className="h-24 w-24 text-muted-foreground/40 mx-auto mb-4 scan-svg"/>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div
                                className="w-16 h-16 border-2 border-muted-foreground/20 border-t-primary rounded-full animate-spin"></div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <h3 className="text-2xl font-semibold text-foreground">
                            Ready to Diagnose
                        </h3>
                        <p className="text-muted-foreground text-lg">
                            Enter a website URL or IP address above to start network diagnostics
                        </p>
                        <p className="text-sm text-muted-foreground/70">
                            Comprehensive results including HTTP checks, ping tests, port scanning,
                            DNS records, and geographical data will appear here
                        </p>
                    </div>
                </div>
            </div>
        </Card>
    )

    return (
        <div className="bg-background">
            <div className="container mx-auto px-4 py-8">
                <h1 className="text-3xl font-bold mb-6">Network Diagnostics</h1>
                
                <div className="space-y-4 mb-6">
                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="flex-1 space-y-2">
                            <Input
                                placeholder="example.com, https://example.com or 192.168.1.1"
                                value={target}
                                onChange={handleTargetChange}
                                onKeyPress={handleTargetKeyPress}
                                className={targetError ? 'border-destructive' : ''}
                            />
                            {targetError && (
                                <p className="text-sm text-destructive">{targetError}</p>
                            )}
                            <Input
                                ref={portInputRef}
                                placeholder="Port(optional): 8080, 44300, ..."
                                value={port}
                                onChange={handlePortChange}
                                onKeyPress={handlePortKeyPress}
                            />
                        </div>

                        <Button
                            onClick={handleCheck}
                            disabled={isLoading || !target.trim()}
                            className="w-full sm:w-auto sm:h-[calc(2*2.5rem+0.5rem)] sm:px-6"
                        >
                            {isLoading ? (
                                <>
                                    <div
                                        className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                    Checking...
                                </>
                            ) : (
                                'Run Diagnostics'
                            )}
                        </Button>
                    </div>
                </div>

                {/* Результаты или плейсхолдер */}
                {results ? (
                    <ResultsTabs
                        key={resultsKey}
                        results={results}
                        onFetchTabData={handleFetchTabData}
                    />
                ) : (
                    <EmptyResultsPlaceholder/>
                )}
            </div>
        </div>
    )
}

export default NetworkChecker
