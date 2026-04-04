import {BrowserRouter, Routes, Route, Navigate} from 'react-router-dom'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {AuthProvider, useAuth} from '@/hooks/useAuth'
import {ProjectProvider} from '@/hooks/useProject'
import {ThemeProvider} from '@/hooks/useTheme'
import {I18nProvider} from '@/i18n'
import {Layout} from '@/components/Layout'
import Auth from '@/pages/Auth'
import Dashboard from '@/pages/Dashboard'
import Agents from '@/pages/Agents'
import AgentTasks from '@/pages/AgentTasks'
import ProfileSettings from '@/pages/ProfileSettings'
import ProjectAgents from '@/pages/ProjectAgents'
import ProjectMembers from '@/pages/ProjectMembers'
import MemberDetail from '@/pages/MemberDetail'

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 5_000,
            retry: 1,
        },
    },
})

function ProtectedRoutes() {
    const {isAuthenticated} = useAuth()
    if (!isAuthenticated) return <Navigate to="/login" replace/>
    return (
        <Routes>
            <Route element={<Layout/>}>
                <Route index element={<Navigate to="/dashboard" replace/>}/>
                <Route path="dashboard" element={<Dashboard/>}/>
                <Route path="agents" element={<ProjectAgents/>}/>
                <Route path="agents/:agentId/tasks" element={<AgentTasks/>}/>
                <Route path="members" element={<ProjectMembers/>}/>
                <Route path="members/:memberId" element={<MemberDetail/>}/>
                <Route path="environments/:envId" element={<Dashboard/>}/>
                <Route path="settings/profile" element={<ProfileSettings/>}/>
            </Route>
        </Routes>
    )
}

export default function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <I18nProvider>
                <ProjectProvider>
                    <ThemeProvider>
                        <AuthProvider>
                            <BrowserRouter>
                                <Routes>
                                    <Route path="/login" element={<Auth/>}/>
                                    <Route path="/*" element={<ProtectedRoutes/>}/>
                                </Routes>
                            </BrowserRouter>
                        </AuthProvider>
                    </ThemeProvider>
                </ProjectProvider>
            </I18nProvider>
        </QueryClientProvider>
    )
}
