import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { ExternalLink } from 'lucide-react'

const QuickExamples = () => {
    const examples = [
        {
            title: 'Popular Websites',
            targets: [
                { name: 'Google', target: 'google.com' },
                { name: 'Cloudflare', target: 'cloudflare.com' },
                { name: 'GitHub', target: 'github.com' }
            ]
        },
        {
            title: 'DNS Providers',
            targets: [
                { name: 'Google DNS', target: '8.8.8.8' },
                { name: 'Cloudflare DNS', target: '1.1.1.1' },
                { name: 'OpenDNS', target: '208.67.222.222' }
            ]
        },
        {
            title: 'Common Services',
            targets: [
                { name: 'HTTP Test', target: 'httpbin.org' },
                { name: 'SSL Labs', target: 'ssllabs.com' },
                { name: 'Speed Test', target: 'speedtest.net' }
            ]
        }
    ]

    return (
        <div className="py-12">
            <div className="container mx-auto px-4">
                <h2 className="text-2xl font-bold mb-8 text-center">Try These Examples</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {examples.map((category, index) => (
                        <Card key={index}>
                            <CardHeader>
                                <CardTitle className="text-lg">{category.title}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {category.targets.map((example, exampleIndex) => (
                                    <div
                                        key={exampleIndex}
                                        className="flex items-center justify-between p-2 hover:bg-muted rounded cursor-pointer group"
                                        onClick={() => {
                                            // onExampleSelect(example.target); можно позже выдумать useDiagnostics чтобы пробрасывать стейту в соседний компонент
                                        }}
                                    >
                                        <div>
                                            <div className="font-medium">{example.name}</div>
                                            <div className="text-sm text-muted-foreground font-mono">
                                                {example.target}
                                            </div>
                                        </div>
                                        <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </div>
    )
}

export default QuickExamples
