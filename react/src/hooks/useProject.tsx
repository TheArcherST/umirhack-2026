import React, {createContext, useContext, useState, useEffect, useCallback, useRef} from 'react'
import {
    stubCreateProject,
    stubGetEnvironments,
    stubGetProjects,
    stubInviteMember,
} from '@/api/stubs'
import type {Project, Environment} from '@/api/types'

interface ProjectContextValue {
    projects: Project[]
    currentProject: Project | null
    environments: Environment[]
    currentEnv: Environment | null
    selectProject: (id: string) => void
    selectEnvironment: (id: string | null) => void
    createProject: (name: string, members: string[]) => Promise<void>
    refreshEnvironments: (projectId?: string) => Promise<void>
    loading: boolean
    /** True once initial project + env data have been loaded */
    initialized: boolean
}

const ProjectContext = createContext<ProjectContextValue | null>(null)

export function ProjectProvider({children}: { children: React.ReactNode }) {
    const [projects, setProjects] = useState<Project[]>([])
    const [environments, setEnvironments] = useState<Environment[]>([])
    const [currentProjectId, setCurrentProjectId] = useState<string | null>(() => {
        return localStorage.getItem('currentProjectId')
    })
    const [currentEnvId, setCurrentEnvId] = useState<string | null>(() => {
        return localStorage.getItem('currentEnvId')
    })
    const [loading, setLoading] = useState(false)
    const [initialized, setInitialized] = useState(false)

    const currentProject = projects.find((p) => p.id === currentProjectId) ?? null
    const currentEnv = environments.find((e) => e.id === currentEnvId) ?? null

    const initialLoadDone = useRef(false)

    // Single sequential load: projects → pick current → environments
    useEffect(() => {
        if (initialLoadDone.current) return
        let cancelled = false

        ;(async () => {
            let loadedProjects: Project[] = []
            try {
                loadedProjects = await stubGetProjects()
            } catch { /* ignore */ }

            if (cancelled) return

            if (loadedProjects.length > 0) {
                setProjects(loadedProjects)

                let resolvedId = currentProjectId
                if (!resolvedId || !loadedProjects.some((p) => p.id === resolvedId)) {
                    resolvedId = loadedProjects[0].id
                    setCurrentProjectId(resolvedId)
                    localStorage.setItem('currentProjectId', resolvedId)
                }

                // Load environments for the resolved project
                try {
                    const envs = await stubGetEnvironments(resolvedId)
                    if (!cancelled) setEnvironments(envs)
                } catch { /* ignore */ }
            }

            if (!cancelled) initialLoadDone.current = true
            if (!cancelled) setInitialized(true)
        })()

        return () => {
            cancelled = true
        }
    }, [])

    const refreshEnvironments = useCallback(async (projectId?: string) => {
        const resolvedProjectId = projectId ?? currentProjectId
        if (!resolvedProjectId) {
            setEnvironments([])
            return
        }
        const data = await stubGetEnvironments(resolvedProjectId)
        setEnvironments(data)
    }, [currentProjectId])

    const selectProject = useCallback(async (id: string) => {
        setCurrentProjectId(id)
        setCurrentEnvId(null)
        localStorage.setItem('currentProjectId', id)
        // Immediately refresh envs for the new project
        try {
            const envs = await stubGetEnvironments(id)
            setEnvironments(envs)
        } catch { /* ignore */ }
    }, [])

    const selectEnvironment = useCallback((id: string | null) => {
        setCurrentEnvId(id)
        if (id) localStorage.setItem('currentEnvId', id)
        else localStorage.removeItem('currentEnvId')
    }, [])

    const createProject = useCallback(async (name: string, members: string[]) => {
        setLoading(true)
        try {
            const project = await stubCreateProject({name})
            for (const email of members) {
                await stubInviteMember({
                    project_id: project.id,
                    email,
                })
            }
            setProjects((prev) => [...prev, project])
            selectProject(project.id)
        } finally {
            setLoading(false)
        }
    }, [selectProject])

    return (
        <ProjectContext.Provider
            value={{
                projects,
                currentProject,
                environments,
                currentEnv,
                selectProject,
                selectEnvironment,
                createProject,
                refreshEnvironments,
                loading,
                initialized,
            }}
        >
            {children}
        </ProjectContext.Provider>
    )
}

export function useProject(): ProjectContextValue {
    const ctx = useContext(ProjectContext)
    if (!ctx) throw new Error('useProject must be used within ProjectProvider')
    return ctx
}
