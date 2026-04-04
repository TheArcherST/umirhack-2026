import {useIsFetching} from '@tanstack/react-query'
import {useEffect, useRef, useState} from 'react'
import {useAuth} from '@/hooks/useAuth'
import {useProject} from '@/hooks/useProject'

/**
 * Returns `true` once auth is resolved AND project data is loaded
 * AND all initial queries have settled. Remains `true` through refetches.
 */
export function useIsPageReady(): boolean {
    const {isLoading: authLoading} = useAuth()
    const {initialized: projectInitialized} = useProject()
    const activeFetches = useIsFetching()
    const [ready, setReady] = useState(false)
    const settledRef = useRef(false)

    useEffect(() => {
        if (authLoading || !projectInitialized) {
            settledRef.current = false
            setReady(false)
            return
        }

        // Auth + project done — wait for all page queries to settle
        if (!settledRef.current && activeFetches === 0) {
            settledRef.current = true
            setReady(true)
        }
    }, [authLoading, projectInitialized, activeFetches])

    return ready
}
