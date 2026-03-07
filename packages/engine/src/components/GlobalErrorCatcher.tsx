"use client";
// =============================================================================
// GlobalErrorCatcher — Catches window 'error' and 'unhandledrejection'
// to surface runtime errors that React ErrorBoundary can't catch.
// Renders a small overlay with the last error message.
// =============================================================================

import { useEffect, useState } from 'react'

interface RuntimeErrorInfo {
  message: string
  details?: string
}

export function GlobalErrorCatcher() {
  const [lastError, setLastError] = useState<RuntimeErrorInfo | null>(null)

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const message = event.message || 'Uncaught error'
      const details = event.error instanceof Error ? event.error.stack : undefined
      // Mirror to console so logs are visible
      console.error('[global-error]', message, event.error)
      setLastError({ message, details })
    }
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason
      const message = reason instanceof Error ? reason.message : String(reason)
      const details = reason instanceof Error ? reason.stack : undefined
      console.error('[global-unhandledrejection]', message, reason)
      setLastError({ message, details })
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  if (!lastError) return null

  return (
    <div className="pointer-events-auto fixed top-3 left-1/2 -translate-x-1/2 z-[9999]">
      <div className="bg-red-950/90 text-red-200 border border-red-700 px-3 py-2 rounded shadow-lg max-w-[80vw]">
        <div className="text-xs font-mono truncate" title={lastError.details ?? lastError.message}>
          {lastError.message}
        </div>
        <div className="mt-1 flex gap-2 text-[10px] justify-end">
          <button
            className="px-2 py-0.5 bg-red-800/60 hover:bg-red-700 rounded"
            onClick={() => setLastError(null)}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}

