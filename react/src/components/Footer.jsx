import React from 'react'
import {Link} from 'react-router-dom'
import {useAuthContext} from "../contexts/AuthContext.jsx";
import { API_DOCS_URL } from '../config'

const Footer = () => {
    const { isAuthenticated } = useAuthContext()
    return (
        <footer className="border-t bg-background">
            <div className="container mx-auto px-4 py-8">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                    {/* Brand */}
                    <div className="space-y-4">
                        <h3 className="text-3xl font-bold">Lvalue</h3>
                        <p className="text-sm text-muted-foreground">
                            Comprehensive network testing and monitoring platform for developers and system
                            administrators.
                        </p>
                    </div>

                    {/* Navigation */}
                    <div>
                        <h4 className="font-semibold mb-4">Navigation</h4>
                        <ul className="space-y-2 text-sm">
                            <li>
                                <Link to="/" className="text-muted-foreground hover:text-primary transition-colors">
                                    Diagnostics
                                </Link>
                            </li>
                            <li>
                                <Link to="/about" className="text-muted-foreground hover:text-primary transition-colors">
                                    About
                                </Link>
                            </li>
                            {isAuthenticated &&
                                <li>
                                    <Link to="/agents"
                                          className="text-muted-foreground hover:text-primary transition-colors">
                                        Agents
                                    </Link>
                                </li>
                            }
                        </ul>
                    </div>

                    {/* Resources */}
                    <div>
                        <h4 className="font-semibold mb-4">Resources</h4>
                        <ul className="space-y-2 text-sm">
                            <li>
                            <a
                                    href="/documentation"
                                    className="text-muted-foreground hover:text-primary transition-colors"
                                >
                                    Documentation
                                </a>
                            </li>
                            <li>
                                <a
                                    href={API_DOCS_URL}
                                    className="text-muted-foreground hover:text-primary transition-colors"
                                >
                                    API Reference
                                </a>
                            </li>
                            <li>
                                <a
                                    href="#"
                                    className="text-muted-foreground hover:text-primary transition-colors"
                                    onClick={(e) => e.preventDefault()}
                                >
                                    Help Center
                                </a>
                            </li>
                        </ul>
                    </div>

                    {/* Legal */}
                    <div>
                        <h4 className="font-semibold mb-4">Legal</h4>
                        <ul className="space-y-2 text-sm">
                            <li>
                                <a
                                    href="#"
                                    className="text-muted-foreground hover:text-primary transition-colors"
                                    onClick={(e) => e.preventDefault()}
                                >
                                    Privacy Policy
                                </a>
                            </li>
                            <li>
                                <a
                                    href="#"
                                    className="text-muted-foreground hover:text-primary transition-colors"
                                    onClick={(e) => e.preventDefault()}
                                >
                                    Terms of Service
                                </a>
                            </li>
                            <li>
                                <a
                                    href="#"
                                    className="text-muted-foreground hover:text-primary transition-colors"
                                    onClick={(e) => e.preventDefault()}
                                >
                                    Acceptable Use
                                </a>
                            </li>
                        </ul>
                    </div>
                </div>

                <div className="border-t mt-8 pt-8 flex flex-col md:flex-row justify-between items-center">
                    <p className="text-sm text-muted-foreground">
                        © {new Date(Date.now()).getFullYear()} Lvalue Network Diagnostics. All rights reserved.
                    </p>
                    <div className="flex space-x-4 mt-4 md:mt-0">
                        <a
                            href="#"
                            className="text-sm text-muted-foreground hover:text-primary transition-colors"
                            onClick={(e) => e.preventDefault()}
                        >
                            Status
                        </a>
                        <a
                            href="#"
                            className="text-sm text-muted-foreground hover:text-primary transition-colors"
                            onClick={(e) => e.preventDefault()}
                        >
                            Contact
                        </a>
                    </div>
                </div>
            </div>
        </footer>
    )
}

export default Footer
