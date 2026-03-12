// ============================================================================
// GET /api/local/sessions/:sessionId/files — Read transcript file contents
//
// Returns LocalSessionFilesResponse with file contents that the frontend
// can use to reconstruct File[] and pass through the existing import pipeline.
//
// Requires AGENTIS_LOCAL_MODE=true and loopback origin.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import type { LocalApiError, LocalSessionFilesResponse } from '@multiverse/shared/local-api-types'
import { guardLocalRequest } from '../../../../../../lib/local-guard'
import { readSessionFiles } from '../../../../../../lib/local-session-files'

// Required for static export compatibility — this route is dynamic
export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
): Promise<NextResponse<LocalSessionFilesResponse | LocalApiError>> {
  // Guard: local mode + loopback
  const denied = guardLocalRequest(request)
  if (denied) return denied

  const { sessionId } = await params

  try {
    const result = await readSessionFiles(sessionId)
    return NextResponse.json(result)
  } catch (error: unknown) {
    const err = error as Error & { code?: string }
    const code = err.code ?? 'internal_error'

    switch (code) {
      case 'SESSION_NOT_FOUND':
        return NextResponse.json<LocalApiError>(
          { code: 'session_not_found', message: err.message },
          { status: 404 },
        )
      case 'NO_USABLE_FILES':
        return NextResponse.json<LocalApiError>(
          { code: 'no_usable_files', message: err.message },
          { status: 422 },
        )
      case 'PAYLOAD_TOO_LARGE':
        return NextResponse.json<LocalApiError>(
          { code: 'payload_too_large', message: err.message },
          { status: 413 },
        )
      default:
        console.error(`[api/local/sessions/${sessionId}/files] Error:`, error)
        return NextResponse.json<LocalApiError>(
          {
            code: 'internal_error',
            message: 'Failed to read session files.',
          },
          { status: 500 },
        )
    }
  }
}
