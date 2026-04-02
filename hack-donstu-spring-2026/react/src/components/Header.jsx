import React, { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuthContext } from '../contexts/AuthContext'
import { Button } from './ui/button'
import LoginModal from './modals/LoginModal'
import { Loader2, Network, Menu, X } from 'lucide-react'

const Header = () => {
    const { isAuthenticated, user, logout, loading } = useAuthContext()
    const [showLoginModal, setShowLoginModal] = useState(false)
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
    const location = useLocation()

    const NavLink = ({ to, children, onClick }) => (
        <Link
            to={to}
            onClick={onClick}
            className={`text-sm font-medium transition-colors hover:text-primary ${
                location.pathname === to ? 'text-primary' : 'text-muted-foreground'
            } block py-2 px-4 rounded-md hover:bg-accent`}
        >
            {children}
        </Link>
    )

    const commonNavLinks = (
        <>
            <NavLink to="/">Diagnostics</NavLink>
            <NavLink to="/about">About</NavLink>
            <NavLink to="/documentation">Documentation</NavLink>
        </>
    )

    const authenticatedNavLinks = (
        <>
            <NavLink to="/">Diagnostics</NavLink>
            <NavLink to="/agents">Agents</NavLink>
            <NavLink to="/about">About</NavLink>
            <NavLink to="/documentation">Documentation</NavLink>
        </>
    )

    const userSection = loading ? (
        <div className="flex items-center space-x-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading...</span>
        </div>
    ) : isAuthenticated ? (
        <div className="flex items-center space-x-4">
            <span className="text-sm text-muted-foreground hidden sm:inline">
                Welcome, {user?.username}
            </span>
            <Button
                variant="outline"
                size="sm"
                onClick={logout}
            >
                Logout
            </Button>
        </div>
    ) : (
        <Button
            size="sm"
            onClick={() => setShowLoginModal(true)}
        >
            Login / Register
        </Button>
    )

    return (
        <>
            <header className="border-b bg-background sticky top-0 z-50">
                <div className="container mx-auto px-4 py-2 sm:py-3">
                    <div className="flex items-center justify-between">
                        {/* Logo and mobile menu button */}
                        <div className="flex items-center space-x-4">
                            <button
                                className="md:hidden p-2 rounded-md hover:bg-accent"
                                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            >
                                {mobileMenuOpen ? (
                                    <X className="h-5 w-5" />
                                ) : (
                                    <Menu className="h-5 w-5" />
                                )}
                            </button>

                            <Link to="/" className="flex items-center space-x-2">
                                <Network className="h-6 w-6 text-primary" />
                                <span className="text-xl sm:text-2xl font-bold">Lvalue</span>
                            </Link>
                        </div>

                        {/* Desktop Navigation */}
                        <nav className="hidden md:flex items-center space-x-6">
                            {isAuthenticated ? authenticatedNavLinks : commonNavLinks}
                        </nav>

                        {/* User section */}
                        <div className="flex items-center space-x-4">
                            {userSection}
                        </div>
                    </div>

                    {/* Mobile Navigation */}
                    {mobileMenuOpen && (
                        <div className="md:hidden mt-4 pb-2 border-t pt-4">
                            <nav className="flex flex-col space-y-2">
                                {isAuthenticated ?
                                    React.Children.map(authenticatedNavLinks.props.children, child =>
                                        React.cloneElement(child, {
                                            onClick: () => setMobileMenuOpen(false)
                                        })
                                    ) :
                                    React.Children.map(commonNavLinks.props.children, child =>
                                        React.cloneElement(child, {
                                            onClick: () => setMobileMenuOpen(false)
                                        })
                                    )
                                }

                                {/* Mobile user info for authenticated users */}
                                {isAuthenticated && !loading && (
                                    <div className="pt-2 mt-2 border-t">
                                        <div className="px-4 py-2 text-sm text-muted-foreground">
                                            Welcome, {user?.username}
                                        </div>
                                    </div>
                                )}
                            </nav>
                        </div>
                    )}
                </div>
            </header>

            {showLoginModal && (
                <LoginModal onClose={() => setShowLoginModal(false)} />
            )}
        </>
    )
}

export default Header
