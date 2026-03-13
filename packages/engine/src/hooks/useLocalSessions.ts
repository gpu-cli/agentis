// ============================================================================
// useLocalSessions — Hook for fetching auto-discovered Claude sessions
//
// Fetches /api/local/sessions on mount. Gracefully handles failure
// (local mode not running, hosted deployment) by returning empty sessions
// without error — the UI simply shows manual upload instead.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import type { LocalSessionSummary } from '@multiverse/shared/local-api-types'

export interface UseLocalSessionsResult {
  /** Discovered sessions (newest first) */
  sessions: LocalSessionSummary[]
  /** Whether the initial fetch is in progress */
  isLoading: boolean
  /** Whether local discovery is available (API reachable and returned data) */
  isLocalAvailable: boolean
  /** Error message if discovery failed (null if gracefully unavailable) */
  error: string | null
  /** Re-fetch sessions */
  refresh: () => void
}

/**
 * Fetch auto-discovered Claude Code sessions from the local API.
 *
 * Behavior:
 * - On mount: fetches /api/local/sessions
 * - On window focus: re-fetches (picks up new sessions)
 * - If fetch fails (403, network error): silently returns empty — no error flash
 * - If fetch succeeds with empty array: isLocalAvailable=true, sessions=[]
 */
export function useLocalSessions(): UseLocalSessionsResult {
  const [sessions, setSessions] = useState<LocalSessionSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLocalAvailable, setIsLocalAvailable] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const fetchSessions = useCallback(async () => {
    // Abort any in-flight request
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/local/sessions?limit=500', {
        signal: controller.signal,
      })

      if (!response.ok) {
        // 403 = local mode disabled or non-loopback — silently unavailable
        if (response.status === 403) {
          setSessions([])
          setIsLocalAvailable(false)
          setIsLoading(false)
          return
        }
        throw new Error(`Discovery failed (${response.status})`)
      }

      const data = (await response.json()) as LocalSessionSummary[]
      setSessions(data)
      setIsLocalAvailable(true)
    } catch (err) {
      if ((err as Error).name === 'AbortError') return

      // Network errors (local API not running) — silently unavailable
      setSessions([])
      setIsLocalAvailable(false)
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false)
      }
    }
  }, [])

  // Fetch on mount
  useEffect(() => {
    fetchSessions()
    return () => abortRef.current?.abort()
  }, [fetchSessions])

  // Re-fetch on window focus
  useEffect(() => {
    const onFocus = () => fetchSessions()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [fetchSessions])

  return {
    sessions,
    isLoading,
    isLocalAvailable,
    error,
    refresh: fetchSessions,
  }
}
