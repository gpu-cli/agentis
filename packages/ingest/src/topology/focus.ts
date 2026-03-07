import type { UniversalEventsPackage } from '@multiverse/shared'

const WEIGHTS: Record<string, number> = {
  'file_change:create': 5,
  'file_change:edit': 5,
  'file_change:delete': 5,
  'tool_call:completed': 3,
  'tool_call:failed': 3,
  'tool_call:started': 2,
  'subagent:spawn': 2,
  'subagent:action': 2,
  'subagent:complete': 2,
  'subagent:failed': 2,
  'progress:update': 1,
  'conversation:message': 0.5,
}

function eventWeight(category: string, action: string): number {
  const specific = WEIGHTS[`${category}:${action}`]
  if (specific !== undefined) {
    return specific
  }
  const categoryOnly = WEIGHTS[`${category}:update`]
  return categoryOnly ?? 0
}

export function computeInitialFocusDomainId(
  input: UniversalEventsPackage,
): string {
  const domains = input.topology.domains
  if (domains.length === 0) {
    return ''
  }

  if (domains.length === 1) {
    return domains[0].id
  }

  const events = input.events
  if (events.length === 0) {
    return domains[0].id
  }

  const windowSize = Math.max(10, Math.min(200, Math.ceil(events.length * 0.2)))
  const earlyWindow = events.slice(0, windowSize)
  const scores = new Map<string, number>()

  for (const domain of domains) {
    scores.set(domain.id, 0)
  }

  for (const event of earlyWindow) {
    const domainId =
      typeof event.context?.domainId === 'string' ? event.context.domainId : undefined
    if (!domainId || !scores.has(domainId)) {
      continue
    }

    scores.set(domainId, (scores.get(domainId) ?? 0) + eventWeight(event.category, event.action))
  }

  const ordered = [...domains].sort((a, b) => {
    const scoreDiff = (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0)
    if (scoreDiff !== 0) {
      return scoreDiff
    }
    return a.id.localeCompare(b.id)
  })

  return ordered[0].id
}
