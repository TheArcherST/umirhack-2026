import React, {createContext, useContext, useState, useEffect, useCallback} from 'react'
import {stubGetProjects, stubCreateProject, stubGetEnvironments} from '@/api/stubs'
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

    const currentProject = projects.find((p) => p.id === currentProjectId) ?? null
    const currentEnv = environments.find((e) => e.id === currentEnvId) ?? null

    const refreshEnvironments = useCallback(async (projectId?: string) => {
        const resolvedProjectId = projectId ?? currentProjectId
        if (!resolvedProjectId) {
            setEnvironments([])
            return
        }
        const data = await stubGetEnvironments(resolvedProjectId)
        setEnvironments(data)
    }, [currentProjectId])

    // Load projects on mount
    useEffect(() => {
        let cancelled = false
        const load = async () => {
            try {
                const data = await stubGetProjects()
                if (!cancelled) {
                    setProjects(data)
                    if (
                        data.length > 0 &&
                        (!currentProjectId || !data.some((project) => project.id === currentProjectId))
                    ) {
                        setCurrentProjectId(data[0].id)
                        localStorage.setItem('currentProjectId', data[0].id)
                    }
                }
            } catch { /* ignore */
            }
        }
        load()
        return () => {
            cancelled = true
        }
    }, [])

    // Load environments when project changes
    useEffect(() => {
        if (!currentProjectId) return
        let cancelled = false
        const load = async () => {
            try {
                const data = await stubGetEnvironments(currentProjectId)
                if (!cancelled) setEnvironments(data)
            } catch { /* ignore */
            }
        }
        load()
        return () => {
            cancelled = true
        }
    }, [currentProjectId])

    const selectProject = useCallback((id: string) => {
        setCurrentProjectId(id)
        setCurrentEnvId(null)
        localStorage.setItem('currentProjectId', id)
    }, [])

    const selectEnvironment = useCallback((id: string | null) => {
        setCurrentEnvId(id)
        if (id) localStorage.setItem('currentEnvId', id)
        else localStorage.removeItem('currentEnvId')
    }, [])

    const createProject = useCallback(async (name: string, _members: string[]) => {
        setLoading(true)
        try {
            const project = await stubCreateProject({name})
            setProjects((prev) => [...prev, project])
            selectProject(project.id)
            await refreshEnvironments(project.id)
        } finally {
            setLoading(false)
        }
    }, [refreshEnvironments, selectProject])

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
                loading
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
