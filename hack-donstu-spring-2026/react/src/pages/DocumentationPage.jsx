import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Book, Server, ExternalLink, Code, Download, Globe, Key, Users } from 'lucide-react'
import { API_DOCS_URL } from '../config'

const DocumentationPage = () => {
    return (
        <div className="min-h-screen bg-background">
            <div className="container mx-auto px-4 py-8">
                {/* Hero Section */}
                <div className="text-center mb-12">
                    <div className="flex items-center justify-center space-x-3 mb-4">
                        <Book className="h-8 w-8 text-primary" />
                        <h1 className="text-4xl font-bold">Lvalue Documentation</h1>
                    </div>
                    <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
                        Complete guide to using Lvalue network diagnostics platform and agent system.
                    </p>
                </div>

                {/* Welcome Section */}
                <Card className="mb-8">
                    <CardHeader>
                        <CardTitle>Welcome to Lvalue</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p>
                            Lvalue is a comprehensive network diagnostics platform that allows you to
                            monitor and test your network infrastructure from multiple locations worldwide.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                            <div className="text-center p-4 border rounded-lg">
                                <Users className="h-8 w-8 text-primary mx-auto mb-2" />
                                <h3 className="font-semibold">1. Create Account</h3>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Register for free to access all features
                                </p>
                            </div>
                            <div className="text-center p-4 border rounded-lg">
                                <Server className="h-8 w-8 text-primary mx-auto mb-2" />
                                <h3 className="font-semibold">2. Deploy Agents</h3>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Set up your own monitoring agents
                                </p>
                            </div>
                            <div className="text-center p-4 border rounded-lg">
                                <Globe className="h-8 w-8 text-primary mx-auto mb-2" />
                                <h3 className="font-semibold">3. Run Diagnostics</h3>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Test your network from multiple locations
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* API Documentation Section */}
                <Card className="mb-8">
                    <CardHeader>
                        <CardTitle className="flex items-center space-x-2">
                            <Code className="h-6 w-6" />
                            <span>API Documentation</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p>
                            For complete API reference, interactive documentation, and live testing,
                            visit our Swagger UI documentation:
                        </p>

                        <div className="bg-primary/5 border border-primary/10 rounded-lg p-6 text-center">
                            <Code className="h-12 w-12 text-primary mx-auto mb-4" />
                            <h3 className="text-lg font-semibold mb-2">Interactive API Documentation</h3>
                            <p className="text-muted-foreground mb-4">
                                Explore all available endpoints, test API calls, and view detailed schemas
                            </p>
                            <Button size="lg">
                                <a
                                    href={API_DOCS_URL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center space-x-2"
                                >
                                    <ExternalLink className="h-4 w-4" />
                                    <span>Open Swagger Documentation</span>
                                </a>
                            </Button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                            <div className="space-y-2">
                                <h4 className="font-semibold flex items-center space-x-2">
                                    <Key className="h-4 w-4" />
                                    <span>Authentication</span>
                                </h4>
                                <p className="text-sm text-muted-foreground">
                                    Use session tokens for authenticated requests with the <code>X-Login-Session-Token</code> header
                                </p>
                            </div>
                            <div className="space-y-2">
                                <h4 className="font-semibold flex items-center space-x-2">
                                    <Globe className="h-4 w-4" />
                                    <span>Network Checks</span>
                                </h4>
                                <p className="text-sm text-muted-foreground">
                                    HTTP, DNS, TCP/UDP, GeoIP, and traceroute checks available through the API
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Agents Section */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center space-x-2">
                            <Server className="h-6 w-6" />
                            <span>Lvalue Agents</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div>
                            <h3 className="text-lg font-semibold mb-3">What are Lvalue Agents?</h3>
                            <p>
                                Lvalue Agents are lightweight Docker containers that you can deploy in your
                                own infrastructure to perform network checks from your private network.
                            </p>
                        </div>

                        <div>
                            <h3 className="text-lg font-semibold mb-3">Setting Up an Agent</h3>
                            <div className="space-y-4">
                                <div className="flex items-start space-x-3">
                                    <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full text-sm flex items-center justify-center mt-1 flex-shrink-0">
                                        1
                                    </div>
                                    <div>
                                        <h4 className="font-medium">Go to Agents Page</h4>
                                        <p className="text-sm text-muted-foreground">
                                            Navigate to the "Agents" section in the main menu (requires authentication)
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-start space-x-3">
                                    <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full text-sm flex items-center justify-center mt-1 flex-shrink-0">
                                        2
                                    </div>
                                    <div>
                                        <h4 className="font-medium">Create New Agent</h4>
                                        <p className="text-sm text-muted-foreground">
                                            Click the "Add New Agent" button and fill in the agent details:
                                        </p>
                                        <ul className="text-sm text-muted-foreground mt-1 space-y-1">
                                            <li>• <strong>Agent Name</strong>: Descriptive name for your agent</li>
                                            <li>• <strong>IP Address</strong>: Public IP of your agent server</li>
                                            <li>• <strong>Port</strong>: Port for agent communication (default: 8080)</li>
                                        </ul>
                                    </div>
                                </div>

                                <div className="flex items-start space-x-3">
                                    <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full text-sm flex items-center justify-center mt-1 flex-shrink-0">
                                        3
                                    </div>
                                    <div>
                                        <h4 className="font-medium">Download Docker Compose</h4>
                                        <p className="text-sm text-muted-foreground">
                                            After creating the agent, download the Docker Compose file that's
                                            pre-configured with your agent settings.
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-start space-x-3">
                                    <div className="w-6 h-6 bg-primary text-primary-foreground rounded-full text-sm flex items-center justify-center mt-1 flex-shrink-0">
                                        4
                                    </div>
                                    <div>
                                        <h4 className="font-medium">Deploy Agent</h4>
                                        <p className="text-sm text-muted-foreground">
                                            On your server, run: <code className="bg-muted px-1 rounded">docker-compose up -d</code>
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-muted p-4 rounded-lg">
                            <h4 className="font-semibold mb-2">Docker Compose Example</h4>
                            <pre className="text-sm bg-background p-3 rounded overflow-x-auto">
{`services:
  agent:
    build: https://git@git.sourcecraft.dev/lvalue/hack-backend.git#main:python
    command: run-agent-rest-server
    container_name: lvalue-agent
    restart: unless-stopped
  sshd:
    build: https://git@git.sourcecraft.dev/lvalue/hack-backend.git#main:sshd
    container_name: lvalue-sshd
    environment:
      PUBLIC_KEY: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEBvWt02O235vrtn0maA6pKbqen1FaAkwRvjGTYGFJQ+"
    ports:
      - "52141:22"  # publish SSH only, agent HTTP endpoint is not published
    depends_on:
      - agent
    restart: unless-stopped`}
                            </pre>
                        </div>

                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <h4 className="font-semibold text-blue-900 mb-2 flex items-center space-x-2">
                                <Download className="h-4 w-4" />
                                <span>Need Help?</span>
                            </h4>
                            <p className="text-blue-800 text-sm">
                                The Docker Compose file is automatically generated when you create an agent
                                and includes all necessary configuration for your specific agent instance.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

export default DocumentationPage
