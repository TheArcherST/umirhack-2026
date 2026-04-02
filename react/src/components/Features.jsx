import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Globe, Shield, Zap, Server, Map, Download } from 'lucide-react'

const Features = () => {
    const features = [
        {
            icon: Globe,
            title: 'Global Network Checks',
            description: 'Test accessibility from multiple locations worldwide to ensure your service is available globally.'
        },
        {
            icon: Shield,
            title: 'Security Scanning',
            description: 'Check SSL certificates, security headers, and identify potential vulnerabilities in your infrastructure.'
        },
        {
            icon: Zap,
            title: 'Performance Metrics',
            description: 'Measure response times, latency, and performance characteristics across different protocols.'
        },
        {
            icon: Server,
            title: 'Agent-Based Testing',
            description: 'Deploy your own agents for private network testing and internal infrastructure monitoring.'
        },
        {
            icon: Map,
            title: 'Geolocation Data',
            description: 'Get detailed geographical information about IP addresses and server locations.'
        },
        {
            icon: Download,
            title: 'Multiple Protocols',
            description: 'Support for HTTP(S), TCP, UDP, ICMP (ping), DNS lookups, and traceroute operations.'
        }
    ]

    return (
        <div className="py-12 bg-muted/30">
            <div className="container mx-auto px-4">
                <div className="text-center mb-12">
                    <h2 className="text-3xl font-bold mb-4">Comprehensive Network Diagnostics</h2>
                    <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                        Everything you need to monitor, test, and analyze your network infrastructure
                        from a single powerful platform.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {features.map((feature, index) => (
                        <Card key={index} className="hover:shadow-lg transition-shadow">
                            <CardHeader>
                                <div className="flex items-center space-x-4">
                                    <div className="p-2 bg-primary/10 rounded-lg">
                                        <feature.icon className="h-6 w-6 text-primary" />
                                    </div>
                                    <CardTitle className="text-lg">{feature.title}</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <p className="text-muted-foreground">{feature.description}</p>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </div>
    )
}

export default Features
