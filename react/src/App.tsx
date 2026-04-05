import {BrowserRouter, Routes, Route, Navigate} from 'react-router-dom'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {AuthProvider, useAuth} from '@/hooks/useAuth'
import {useIsPageReady} from '@/hooks/useIsPageReady'
import {ProjectProvider} from '@/hooks/useProject'
import {ThemeProvider} from '@/hooks/useTheme'
import {I18nProvider} from '@/i18n'
import {Layout} from '@/components/Layout'
import {EnvironmentLayout} from '@/components/EnvironmentLayout'
import {AuthBlurLoader} from '@/components/PageBlurLoader'
import Auth from '@/pages/Auth'
import Dashboard from '@/pages/Dashboard'
import Agents from '@/pages/Agents'
import AgentTasks from '@/pages/AgentTasks'
import ProfileSettings from '@/pages/ProfileSettings'
import ProjectAgents from '@/pages/ProjectAgents'
import ProjectMembers from '@/pages/ProjectMembers'
import MemberDetail from '@/pages/MemberDetail'
import EnvironmentDashboard from '@/pages/EnvironmentDashboard'
import EnvironmentHosts from '@/pages/EnvironmentHosts'
import EnvironmentHostDetail from '@/pages/EnvironmentHostDetail'
import EnvironmentTasks from '@/pages/EnvironmentTasks'
import EnvironmentScheduleRules from '@/pages/EnvironmentScheduleRules'
import ApiKeysPage from '@/pages/ApiKeysPage'
import EnvironmentCompliance from '@/pages/EnvironmentCompliance'

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
        <ProjectProvider>
            <ProtectedContent />
        </ProjectProvider>
    )
}

function ProtectedContent() {
    const isPageReady = useIsPageReady()

    const content = (
        <Routes>
            <Route element={<Layout/>}>
                <Route index element={<Navigate to="/dashboard" replace/>}/>
                <Route path="dashboard" element={<Dashboard/>}/>
                <Route path="agents" element={<ProjectAgents/>}/>
                <Route path="agents/:agentId/tasks" element={<AgentTasks/>}/>
                <Route path="members" element={<ProjectMembers/>}/>
                <Route path="members/:memberId" element={<MemberDetail/>}/>
                <Route path="settings/profile" element={<ProfileSettings/>}/>
            </Route>
            <Route element={<EnvironmentLayout/>}>
                <Route path="environments/:envId" element={<EnvironmentDashboard/>}/>
                <Route path="environments/:envId/hosts" element={<EnvironmentHosts/>}/>
                <Route path="environments/:envId/hosts/:hostId" element={<EnvironmentHostDetail/>}/>
                <Route path="environments/:envId/tasks" element={<EnvironmentTasks/>}/>
                <Route path="environments/:envId/schedule" element={<EnvironmentScheduleRules/>}/>
                <Route path="environments/:envId/api-keys" element={<ApiKeysPage/>}/>
                <Route path="environments/:envId/compliance" element={<EnvironmentCompliance/>}/>
            </Route>
        </Routes>
    )

    return (
        <AuthBlurLoader isLoading={!isPageReady}>
            {content}
        </AuthBlurLoader>
    )
}

export default function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <I18nProvider>
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
            </I18nProvider>
        </QueryClientProvider>
    )
}
