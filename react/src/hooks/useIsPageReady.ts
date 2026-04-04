import {useIsFetching} from '@tanstack/react-query'
import {useEffect, useRef, useState} from 'react'
import {useAuth} from '@/hooks/useAuth'

/**
 * Returns `true` once auth is resolved AND all initial queries have settled
 * (i.e. no active fetches right after mount). Remains `true` through refetches.
 */
export function useIsPageReady(): boolean {
    const {isLoading: authLoading} = useAuth()
    const activeFetches = useIsFetching()
    const [ready, setReady] = useState(false)
    const settledRef = useRef(false)

    useEffect(() => {
        if (authLoading) {
            settledRef.current = false
            setReady(false)
            return
        }

        // Auth done — wait for all page queries to settle
        if (!settledRef.current && activeFetches === 0) {
            settledRef.current = true
            setReady(true)
        }
    }, [authLoading, activeFetches])

    return ready
}
