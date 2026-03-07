import type { UniversalEvent } from '@multiverse/shared'

function cloneEvent(event: UniversalEvent): UniversalEvent {
  return {
    ...event,
    target: event.target ? { ...event.target } : event.target,
    context: event.context ? { ...event.context } : event.context,
  }
}

export function correlateClaudeEvents(events: UniversalEvent[]): UniversalEvent[] {
  const correlated = events.map(cloneEvent)

  const toolStartByCorrelationId = new Map<string, UniversalEvent>()
  const toolStartByToolId = new Map<string, UniversalEvent>()

  for (const event of correlated) {
    if (event.category === 'tool_call' && event.action === 'started') {
      if (event.correlationId) {
        toolStartByCorrelationId.set(event.correlationId, event)
      }
      if (event.target?.kind === 'tool' && event.target.id) {
        toolStartByToolId.set(event.target.id, event)
      }
    }
  }

  for (const event of correlated) {
    if (event.category === 'tool_call' && (event.action === 'completed' || event.action === 'failed')) {
      const byCorrelation = event.correlationId
        ? toolStartByCorrelationId.get(event.correlationId)
        : undefined
      const byToolId = event.target?.kind === 'tool' && event.target.id
        ? toolStartByToolId.get(event.target.id)
        : undefined
      const start = byCorrelation ?? byToolId

      if (start) {
        event.parentEventId = start.id
        event.actorId = start.actorId
      }
    }

    if (event.category === 'progress' && !event.parentEventId) {
      const parentToolUseId =
        typeof event.context?.parentToolUseID === 'string'
          ? event.context.parentToolUseID
          : typeof event.context?.toolUseID === 'string'
            ? event.context.toolUseID
            : undefined

      if (parentToolUseId) {
        const start = toolStartByToolId.get(parentToolUseId)
        if (start) {
          event.parentEventId = start.id
          event.correlationId = start.correlationId ?? event.correlationId
          event.actorId = start.actorId
        }
      }
    }
  }

  const actorSeq = new Map<string, number>()
  for (const event of correlated) {
    const seq = (actorSeq.get(event.actorId) ?? 0) + 1
    actorSeq.set(event.actorId, seq)
    event.actorSeq = seq
  }

  return correlated
}
