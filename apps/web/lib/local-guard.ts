// ============================================================================
// Local Guard — Middleware for /api/local/* routes
//
// Enforces two checks:
// 1. AGENTIS_LOCAL_MODE must be "true"
// 2. Request must originate from loopback (127.0.0.1 or ::1)
//
// Returns a NextResponse error if either check fails, or null if the
// request is allowed to proceed.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import type { LocalApiError } from '@multiverse/shared/local-api-types'
import { isLocalMode } from './local-mode'

/**
 * Extract the client IP from a Next.js request.
 *
 * Checks (in order):
 * 1. x-forwarded-for header (first entry)
 * 2. x-real-ip header
 * 3. Next.js geo/ip (if available)
 *
 * Returns null if no IP can be determined.
 */
function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }

  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp.trim()

  // Next.js provides ip on the request in some environments
  return (request as any).ip ?? null
}

/** Check if an IP address is a loopback address */
function isLoopback(ip: string): boolean {
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    ip === 'localhost'
  )
}

/**
 * Guard for /api/local/* routes.
 *
 * Call at the top of every local API route handler:
 * ```ts
 * const denied = guardLocalRequest(request)
 * if (denied) return denied
 * ```
 *
 * Returns null if the request is allowed, or a NextResponse with
 * the appropriate error status and body.
 */
export function guardLocalRequest(request: NextRequest): NextResponse<LocalApiError> | null {
  // Check 1: local mode must be enabled
  if (!isLocalMode()) {
    return NextResponse.json<LocalApiError>(
      {
        code: 'local_mode_disabled',
        message: 'Local discovery APIs are not available. Set AGENTIS_LOCAL_MODE=true to enable.',
      },
      { status: 403 },
    )
  }

  // Check 2: request must be from loopback
  const clientIp = getClientIp(request)

  // If we can't determine the IP and we're in local mode,
  // allow the request (local dev servers often don't set forwarded headers).
  // The binding to 127.0.0.1 in the CLI runner provides the primary security.
  if (clientIp && !isLoopback(clientIp)) {
    return NextResponse.json<LocalApiError>(
      {
        code: 'not_loopback',
        message: 'Local discovery APIs are only accessible from localhost.',
      },
      { status: 403 },
    )
  }

  return null
}
