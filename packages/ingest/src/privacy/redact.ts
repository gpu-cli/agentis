import { createHash } from 'node:crypto'

import type { UniversalEventsPackage } from '@multiverse/shared'

import { buildPrivacyManifest } from './manifest'
import { scrubSecrets } from './secrets'

function hashValue(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function pseudonymizePath(path: string): string {
  if (!path.startsWith('/')) {
    return path
  }

  const parts = path.split('/').filter((part) => part.length > 0)
  if (parts.length <= 2) {
    return '/workspace'
  }

  return `/workspace/${parts.slice(-2).join('/')}`
}

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

export function applyPrivacyRedaction(
  input: UniversalEventsPackage,
): UniversalEventsPackage {
  let redactedEventCount = 0
  let redactedFieldCount = 0

  const exportMode = input.run.import.exportMode
  const shareable = exportMode === 'shareable'

  const events = input.events.map((event) => {
    let redacted = event.redacted
    let context = event.context ? sanitizeContext(event.context) : event.context

    if (event.category === 'reasoning') {
      context = {
        summary: '[redacted]',
      }
      redacted = true
      redactedEventCount += 1
      redactedFieldCount += 1
    }

    if (event.category === 'tool_call' && context && typeof context.resultHash !== 'string' && typeof context.output === 'string') {
      context.resultHash = hashValue(context.output)
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
  })

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
