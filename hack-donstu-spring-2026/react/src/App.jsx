import React from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import Header from './components/Header'
import NetworkChecker from './components/NetworkChecker'
import AgentsPage from './pages/AgentsPage'
import ProtectedRoute from './components/ProtectedRoute'
import Footer from "./components/Footer.jsx";
import AboutPage from "./pages/AboutPage.jsx";
import QuickExamples from "./components/QuickExamples.jsx";
import Features from "./components/Features.jsx";
import DocumentationPage from "./pages/DocumentationPage.jsx";

function App() {
    return (
        <AuthProvider>
            <Router>
                <div className="min-h-screen bg-background">
                    <Header />
                    <main>
                        <Routes>
                            <Route path="/" element={
                                <>
                                    <NetworkChecker id="diagnostics" />
                                    <Features id="features"/>
                                    <QuickExamples />
                                </>
                            } />
                            <Route
                                path="/agents"
                                element={
                                    <ProtectedRoute>
                                        <AgentsPage />
                                    </ProtectedRoute>
                                }
                            />
                            <Route path="/about" element={<AboutPage />} />
                            <Route path="/documentation" element={<DocumentationPage />} />
                        </Routes>
                    </main>
                    <Footer/>
                </div>
            </Router>
        </AuthProvider>
    )
}

export default App
