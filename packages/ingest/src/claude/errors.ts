import type { UniversalEvent, UniversalIssue } from '@multiverse/shared'

export function inferIssuesFromClaudeEvents(
  events: UniversalEvent[],
): UniversalIssue[] {
  const issues: UniversalIssue[] = []
  const errorEvents = events.filter(
    (event) =>
      event.status === 'error' ||
      (event.category === 'tool_call' && event.action === 'failed') ||
      (typeof event.context?.exitCode === 'number' && event.context.exitCode !== 0),
  )

  for (const event of errorEvents) {
    const summary =
      typeof event.context?.errorMessage === 'string'
        ? event.context.errorMessage
        : event.target?.name
          ? `${event.target.name} failed`
          : `${event.category}:${event.action} failed`

    const domainId =
      typeof event.context?.domainId === 'string' ? event.context.domainId : undefined
    const districtId =
      typeof event.context?.districtId === 'string' ? event.context.districtId : undefined

    issues.push({
      id: `iss_${issues.length + 1}`,
      severity: 'error',
      status: 'open',
      summary,
      linkedEventIds: [event.id],
      linkedActorIds: [event.actorId],
      domainId,
      districtId,
    })
  }

  return issues
}
