// ============================================================================
// GET /api/local/sessions — List discovered Claude Code sessions
//
// Query params:
//   limit   — max sessions to return (default 50)
//   project — filter by project name substring
//
// Requires AGENTIS_LOCAL_MODE=true and loopback origin.
// Returns LocalSessionSummary[] or LocalApiError.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import type { LocalApiError, LocalSessionSummary } from '@multiverse/shared/local-api-types'
import { guardLocalRequest } from '../../../../lib/local-guard'
import { discoverLocalSessions } from '../../../../lib/local-discovery'

// Required for static export compatibility — this route is dynamic
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest): Promise<NextResponse<LocalSessionSummary[] | LocalApiError>> {
  // Guard: local mode + loopback
  const denied = guardLocalRequest(request)
  if (denied) return denied

  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') ?? '50', 10)
    const project = searchParams.get('project') ?? undefined

    const sessions = await discoverLocalSessions({
      limit: Number.isFinite(limit) && limit > 0 ? limit : 50,
      project,
    })

    return NextResponse.json(sessions)
  } catch (error) {
    console.error('[api/local/sessions] Discovery failed:', error)
    return NextResponse.json<LocalApiError>(
      {
        code: 'discovery_failed',
        message: 'Failed to discover Claude Code sessions. Check that ~/.claude/projects/ exists.',
      },
      { status: 500 },
    )
  }
}
