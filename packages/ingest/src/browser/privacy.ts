// ============================================================================
// Browser-safe privacy redaction (no node:crypto)
// Ported from packages/ingest/src/privacy/ — uses crypto.subtle for hashing
// ============================================================================

import type {
  UniversalEventsPackage,
  UniversalPrivacy,
} from '@multiverse/shared'

import { sha256 } from './hash'

// ---------------------------------------------------------------------------
// Secret scrubbing patterns (ported from privacy/secrets.ts)
// ---------------------------------------------------------------------------

export interface SecretPattern {
  name: string
  expression: RegExp
}

export const DEFAULT_SECRET_PATTERNS: SecretPattern[] = [
  {
    name: 'generic-key',
    expression: /(?:sk|pk|api|key|token|secret|password|bearer|auth)[-_]?[A-Za-z0-9]{16,}/giu,
  },
  {
    name: 'github-pat',
    expression: /ghp_[A-Za-z0-9]{36}/gu,
  },
  {
    name: 'slack-token',
    expression: /xoxb-[A-Za-z0-9-]+/gu,
  },
  {
    name: 'pem-key',
    expression: /-----BEGIN [A-Z ]+ KEY-----/gu,
  },
  {
    name: 'jwt-like',
    expression: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/gu,
  },
]

/** Scrub known secret patterns from a string, replacing with [redacted-secret]. */
export function scrubSecrets(input: string): string {
  let output = input
  for (const pattern of DEFAULT_SECRET_PATTERNS) {
    output = output.replace(pattern.expression, '[redacted-secret]')
  }
  return output
}

// ---------------------------------------------------------------------------
// Path pseudonymization (ported from privacy/redact.ts)
// ---------------------------------------------------------------------------

function pseudonymizePath(path: string): string {
  if (!path.startsWith('/')) return path

  const parts = path.split('/').filter((part) => part.length > 0)
  if (parts.length <= 2) return '/workspace'

  return `/workspace/${parts.slice(-2).join('/')}`
}

// ---------------------------------------------------------------------------
// Context sanitization
// ---------------------------------------------------------------------------

function sanitizeContext(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string') {
      output[key] = scrubSecrets(value)
      continue
    }
    output[key] = value
  }
  return output
}

// ---------------------------------------------------------------------------
// Privacy manifest builder (ported from privacy/manifest.ts)
// ---------------------------------------------------------------------------

function buildPrivacyManifest(input: UniversalPrivacy): UniversalPrivacy {
  return {
    policy: input.policy,
    redactions: {
      ...input.redactions,
      redactedEventCount: input.redactions.redactedEventCount ?? 0,
      redactedFieldCount: input.redactions.redactedFieldCount ?? 0,
      hashAlgorithm: input.redactions.hashAlgorithm ?? 'sha256',
      hashSalted: input.redactions.hashSalted ?? true,
      absolutePathsRedacted: input.redactions.absolutePathsRedacted ?? true,
      actorNamesPseudonymized: input.redactions.actorNamesPseudonymized ?? true,
    },
  }
}

// ---------------------------------------------------------------------------
// Full redaction pass (async because sha256 uses crypto.subtle)
// ---------------------------------------------------------------------------

/**
 * Apply privacy redaction to a UniversalEventsPackage:
 * - Scrub secrets from all event context strings
 * - Hash tool output content (crypto.subtle SHA-256)
 * - Redact thinking/reasoning content
 * - Pseudonymize absolute paths (in shareable mode)
 * - Pseudonymize human actor names (in shareable mode)
 */
export async function applyPrivacyRedaction(
  input: UniversalEventsPackage,
): Promise<UniversalEventsPackage> {
  let redactedEventCount = 0
  let redactedFieldCount = 0

  const exportMode = input.run.import.exportMode
  const shareable = exportMode === 'shareable'

  const events = await Promise.all(
    input.events.map(async (event) => {
      let redacted = event.redacted
      let context = event.context ? sanitizeContext(event.context) : event.context

      // Fully redact reasoning/thinking content
      if (event.category === 'reasoning') {
        context = { summary: '[redacted]' }
        redacted = true
        redactedEventCount += 1
        redactedFieldCount += 1
      }

      // Hash tool output content (real SHA-256 via crypto.subtle)
      if (
        event.category === 'tool_call' &&
        context &&
        typeof context.resultHash !== 'string' &&
        typeof context.output === 'string'
      ) {
        context.resultHash = await sha256(context.output)
        delete context.output
        redactedFieldCount += 1
      }

      return {
        ...event,
        context,
        redacted,
        rawRef: event.rawRef
          ? {
              path: shareable ? pseudonymizePath(event.rawRef.path) : event.rawRef.path,
              line: event.rawRef.line,
            }
          : undefined,
      }
    }),
  )

  const actors = input.actors.map((actor, index) => ({
    ...actor,
    name: shareable && actor.kind === 'human' ? `human-${index + 1}` : actor.name,
  }))

  const runInputPaths = input.run.import.inputPaths.map((path) =>
    shareable ? pseudonymizePath(path) : path,
  )

  const privacy = buildPrivacyManifest({
    policy: input.privacy.policy,
    redactions: {
      ...input.privacy.redactions,
      thinkingContent: true,
      toolOutputContent: 'hashed',
      secretPatternsApplied: true,
      redactedEventCount,
      redactedFieldCount,
      absolutePathsRedacted: shareable,
      actorNamesPseudonymized: shareable,
    },
  })

  return {
    ...input,
    run: {
      ...input.run,
      import: {
        ...input.run.import,
        inputPaths: runInputPaths,
      },
    },
    actors,
    events,
    privacy,
  }
}
