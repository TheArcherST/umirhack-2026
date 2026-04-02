import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Users, Target, Zap, Shield } from 'lucide-react'

const AboutPage = () => {
    return (
        <div className="min-h-screen bg-background">
            <div className="container mx-auto px-4 py-12">
                {/* Hero Section */}
                <div className="text-center mb-16">
                    <h1 className="text-4xl font-bold mb-4">About Network Diagnostics</h1>
                    <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
                        A comprehensive platform for network testing, monitoring, and analysis
                        designed for developers, system administrators, and IT professionals.
                    </p>
                </div>

                {/* Mission Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-16">
                    <div>
                        <h2 className="text-2xl font-bold mb-6">Our Mission</h2>
                        <p className="text-muted-foreground mb-4">
                            We believe that understanding your network's behavior is crucial for
                            building reliable and performant applications. Our platform provides
                            the tools you need to gain deep insights into your network infrastructure.
                        </p>
                        <p className="text-muted-foreground">
                            From simple ping tests to comprehensive security scans, we offer
                            a wide range of diagnostic tools that help you identify issues before
                            they impact your users.
                        </p>
                    </div>
                    <div className="bg-muted rounded-lg p-8">
                        <h3 className="text-lg font-semibold mb-4">Key Features</h3>
                        <ul className="space-y-3 text-muted-foreground">
                            <li className="flex items-center space-x-2">
                                <Target className="h-4 w-4 text-primary" />
                                <span>Multi-protocol testing (HTTP, TCP, UDP, ICMP)</span>
                            </li>
                            <li className="flex items-center space-x-2">
                                <Zap className="h-4 w-4 text-primary" />
                                <span>Global performance monitoring</span>
                            </li>
                            <li className="flex items-center space-x-2">
                                <Shield className="h-4 w-4 text-primary" />
                                <span>Security and SSL analysis</span>
                            </li>
                            <li className="flex items-center space-x-2">
                                <Users className="h-4 w-4 text-primary" />
                                <span>Agent-based private network testing</span>
                            </li>
                        </ul>
                    </div>
                </div>

                {/* How It Works */}
                <div className="mb-16">
                    <h2 className="text-2xl font-bold mb-8 text-center">How It Works</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center space-x-2">
                                    <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full text-sm flex items-center justify-center">
                                        1
                                    </div>
                                    <span>Enter Target</span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-muted-foreground">
                                    Provide a domain name or IP address. You can optionally specify
                                    a port for TCP/UDP testing.
                                </p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center space-x-2">
                                    <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full text-sm flex items-center justify-center">
                                        2
                                    </div>
                                    <span>Run Tests</span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-muted-foreground">
                                    Our platform performs comprehensive checks including network
                                    reachability, service availability, and security analysis.
                                </p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center space-x-2">
                                    <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full text-sm flex items-center justify-center">
                                        3
                                    </div>
                                    <span>Analyze Results</span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-muted-foreground">
                                    View detailed results across multiple tabs with comprehensive
                                    data about performance, security, and accessibility.
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                </div>

                {/* Use Cases */}
                <Card>
                    <CardHeader>
                        <CardTitle>Common Use Cases</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <h4 className="font-semibold mb-2">Website Monitoring</h4>
                                <p className="text-sm text-muted-foreground">
                                    Regularly check your website's availability, performance, and
                                    SSL certificate status from multiple global locations.
                                </p>
                            </div>
                            <div>
                                <h4 className="font-semibold mb-2">API Health Checks</h4>
                                <p className="text-sm text-muted-foreground">
                                    Monitor your API endpoints for response times, status codes,
                                    and overall service health.
                                </p>
                            </div>
                            <div>
                                <h4 className="font-semibold mb-2">Network Troubleshooting</h4>
                                <p className="text-sm text-muted-foreground">
                                    Diagnose connectivity issues, port availability, and routing
                                    problems across your infrastructure.
                                </p>
                            </div>
                            <div>
                                <h4 className="font-semibold mb-2">Security Auditing</h4>
                                <p className="text-sm text-muted-foreground">
                                    Identify open ports, check SSL configurations, and verify
                                    security headers on your services.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

export default AboutPage
