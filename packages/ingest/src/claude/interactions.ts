import type { UniversalEvent, UniversalInteraction } from '@multiverse/shared'

export function inferInteractionsFromClaudeEvents(
  events: UniversalEvent[],
): UniversalInteraction[] {
  const interactions: UniversalInteraction[] = []

  const spawnEvents = events.filter(
    (event) => event.category === 'subagent' && event.action === 'spawn',
  )

  for (const event of spawnEvents) {
    if (event.target?.kind !== 'actor' || !event.target.id) {
      continue
    }

    interactions.push({
      id: `int_${String(interactions.length + 1).padStart(3, '0')}`,
      type: 'handoff',
      fromActorId: event.actorId,
      toActorId: event.target.id,
      eventId: event.id,
      reason: 'Subagent spawned via Task tool call',
    })
  }

  const failedEvents = events.filter((event) => event.status === 'error')
  for (const event of failedEvents) {
    interactions.push({
      id: `int_${String(interactions.length + 1).padStart(3, '0')}`,
      type: 'block',
      fromActorId: event.actorId,
      toActorId: event.actorId,
      eventId: event.id,
      reason: 'Error blocks actor progress until resolution',
    })
  }

  return interactions
}
