import {
  UNIVERSAL_EVENTS_SCHEMA,
  type UniversalDomain,
  type UniversalEvent,
  type UniversalEventsPackage,
} from './universal-events'

export interface UniversalValidationError {
  path: string
  message: string
}

export interface UniversalValidationResult {
  ok: boolean
  errors: UniversalValidationError[]
  value?: UniversalEventsPackage
}

export interface UniversalValidationOptions {
  requireShareablePrivacy?: boolean
}

const UNIVERSAL_EVENT_CATEGORIES = new Set([
  'conversation',
  'reasoning',
  'tool_call',
  'progress',
  'file_change',
  'system',
  'checkpoint',
  'background_task',
  'subagent',
])

const UNIVERSAL_EVENT_STATUS = new Set(['ok', 'error', 'pending', 'skipped'])
const UNIVERSAL_ISSUE_SEVERITY = new Set(['info', 'warning', 'error', 'critical'])
const UNIVERSAL_ISSUE_STATUS = new Set(['open', 'resolved', 'dismissed'])
const UNIVERSAL_DOMAIN_KIND = new Set([
  'git_repo',
  'local_folder',
  'cloud_prefix',
  'docs_root',
  'unknown',
])
const UNIVERSAL_ARTIFACT_KIND = new Set([
  'file',
  'directory',
  'command_output',
  'document',
  'url',
])
const UNIVERSAL_TOOL_OUTPUT_POLICY = new Set(['hashed', 'stripped', 'none'])
const UNIVERSAL_ACTOR_KIND = new Set(['human', 'agent', 'subagent'])
const UNIVERSAL_INTERACTION_TYPE = new Set(['handoff', 'assist', 'block', 'resolve'])

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function addError(errors: UniversalValidationError[], path: string, message: string): void {
  errors.push({ path, message })
}

function checkDateTime(errors: UniversalValidationError[], path: string, value: unknown): void {
  if (!isNonEmptyString(value)) {
    addError(errors, path, 'must be a non-empty string')
    return
  }

  if (Number.isNaN(Date.parse(value))) {
    addError(errors, path, 'must be a valid ISO date-time string')
  }
}

function checkStringEnum(
  errors: UniversalValidationError[],
  path: string,
  value: unknown,
  allowed: Set<string>,
): void {
  if (!isNonEmptyString(value)) {
    addError(errors, path, 'must be a non-empty string')
    return
  }

  if (!allowed.has(value)) {
    addError(errors, path, `must be one of: ${[...allowed].join(', ')}`)
  }
}

function checkIdArray(
  errors: UniversalValidationError[],
  path: string,
  value: unknown,
): value is string[] {
  if (!Array.isArray(value)) {
    addError(errors, path, 'must be an array')
    return false
  }

  value.forEach((entry, index) => {
    if (!isNonEmptyString(entry)) {
      addError(errors, `${path}[${index}]`, 'must be a non-empty string')
    }
  })

  return true
}

function hasReference(ids: Set<string>, value: unknown): value is string {
  return isNonEmptyString(value) && ids.has(value)
}

function validateDomains(errors: UniversalValidationError[], value: unknown): UniversalDomain[] {
  if (!Array.isArray(value) || value.length === 0) {
    addError(errors, 'topology.domains', 'must be a non-empty array')
    return []
  }

  const domains: UniversalDomain[] = []
  value.forEach((domain, index) => {
    const path = `topology.domains[${index}]`
    if (!isObject(domain)) {
      addError(errors, path, 'must be an object')
      return
    }

    if (!isNonEmptyString(domain.id)) {
      addError(errors, `${path}.id`, 'must be a non-empty string')
    }
    if (!isNonEmptyString(domain.name)) {
      addError(errors, `${path}.name`, 'must be a non-empty string')
    }
    if (!isNonEmptyString(domain.root)) {
      addError(errors, `${path}.root`, 'must be a non-empty string')
    }
    checkStringEnum(errors, `${path}.kind`, domain.kind, UNIVERSAL_DOMAIN_KIND)

    if (!isNumber(domain.confidence) || domain.confidence < 0 || domain.confidence > 1) {
      addError(errors, `${path}.confidence`, 'must be a number between 0 and 1')
    }

    domains.push(domain as unknown as UniversalDomain)
  })

  return domains
}

function validateEvents(
  errors: UniversalValidationError[],
  value: unknown,
  actorIds: Set<string>,
): UniversalEvent[] {
  if (!Array.isArray(value) || value.length === 0) {
    addError(errors, 'events', 'must be a non-empty array')
    return []
  }

  const eventIds = new Set<string>()
  const dedupeKeys = new Set<string>()
  const lastActorSeq = new Map<string, number>()
  let lastGlobalSeq = 0

  value.forEach((event, index) => {
    const path = `events[${index}]`
    if (!isObject(event)) {
      addError(errors, path, 'must be an object')
      return
    }

    if (!isNonEmptyString(event.id)) {
      addError(errors, `${path}.id`, 'must be a non-empty string')
    } else if (eventIds.has(event.id)) {
      addError(errors, `${path}.id`, 'must be unique')
    } else {
      eventIds.add(event.id)
    }

    if (!isNonEmptyString(event.actorId) || !actorIds.has(event.actorId)) {
      addError(errors, `${path}.actorId`, 'must reference an existing actor')
    }

    const seqGlobal = event.seqGlobal
    if (typeof seqGlobal !== 'number' || !Number.isInteger(seqGlobal) || seqGlobal <= 0) {
      addError(errors, `${path}.seqGlobal`, 'must be a positive integer')
    } else if (seqGlobal <= lastGlobalSeq) {
      addError(errors, `${path}.seqGlobal`, 'must be strictly increasing')
    } else {
      lastGlobalSeq = seqGlobal
    }

    const actorSeq = event.actorSeq
    if (typeof actorSeq !== 'number' || !Number.isInteger(actorSeq) || actorSeq <= 0) {
      addError(errors, `${path}.actorSeq`, 'must be a positive integer')
    } else if (isNonEmptyString(event.actorId)) {
      const previous = lastActorSeq.get(event.actorId) ?? 0
      if (actorSeq <= previous) {
        addError(errors, `${path}.actorSeq`, 'must be strictly increasing per actor')
      }
      lastActorSeq.set(event.actorId, actorSeq)
    }

    checkDateTime(errors, `${path}.ts`, event.ts)
    checkStringEnum(errors, `${path}.category`, event.category, UNIVERSAL_EVENT_CATEGORIES)
    checkStringEnum(errors, `${path}.status`, event.status, UNIVERSAL_EVENT_STATUS)

    if (!isNonEmptyString(event.action)) {
      addError(errors, `${path}.action`, 'must be a non-empty string')
    }

    if (!isNonEmptyString(event.dedupeKey)) {
      addError(errors, `${path}.dedupeKey`, 'must be a non-empty string')
    } else if (dedupeKeys.has(event.dedupeKey)) {
      addError(errors, `${path}.dedupeKey`, 'must be unique')
    } else {
      dedupeKeys.add(event.dedupeKey)
    }

    if (typeof event.redacted !== 'boolean') {
      addError(errors, `${path}.redacted`, 'must be a boolean')
    }
  })

  return value as UniversalEvent[]
}

export function validateUniversalEventsPackage(
  input: unknown,
  options: UniversalValidationOptions = {},
): UniversalValidationResult {
  const errors: UniversalValidationError[] = []

  if (!isObject(input)) {
    addError(errors, '$', 'must be an object')
    return { ok: false, errors }
  }

  if (input.schema !== UNIVERSAL_EVENTS_SCHEMA) {
    addError(errors, 'schema', `must equal "${UNIVERSAL_EVENTS_SCHEMA}"`)
  }

  const schemaVersion = input.schemaVersion
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion) || schemaVersion < 1) {
    addError(errors, 'schemaVersion', 'must be an integer >= 1')
  }

  if (!isObject(input.run)) {
    addError(errors, 'run', 'must be an object')
  } else {
    if (!isNonEmptyString(input.run.id)) {
      addError(errors, 'run.id', 'must be a non-empty string')
    }
    if (!isNonEmptyString(input.run.source)) {
      addError(errors, 'run.source', 'must be a non-empty string')
    }
    checkDateTime(errors, 'run.createdAt', input.run.createdAt)
    checkDateTime(errors, 'run.timeRange.start', isObject(input.run.timeRange) ? input.run.timeRange.start : undefined)
    checkDateTime(errors, 'run.timeRange.end', isObject(input.run.timeRange) ? input.run.timeRange.end : undefined)

    if (!isNonEmptyString(input.run.inputDigest) || !/^sha256:[a-f0-9]{64}$/u.test(input.run.inputDigest)) {
      addError(errors, 'run.inputDigest', 'must match sha256:<64 lowercase hex chars>')
    }

    const importSection = input.run.import
    if (!isObject(importSection)) {
      addError(errors, 'run.import', 'must be an object')
    } else {
      if (!Array.isArray(importSection.inputPaths) || importSection.inputPaths.length === 0) {
        addError(errors, 'run.import.inputPaths', 'must be a non-empty array')
      }
      if (!isNonEmptyString(importSection.redactionPolicy)) {
        addError(errors, 'run.import.redactionPolicy', 'must be a non-empty string')
      }
    }
  }

  if (!isObject(input.topology)) {
    addError(errors, 'topology', 'must be an object')
    return { ok: false, errors }
  }

  if (!isObject(input.topology.world)) {
    addError(errors, 'topology.world', 'must be an object')
  } else {
    if (!isNonEmptyString(input.topology.world.id)) {
      addError(errors, 'topology.world.id', 'must be a non-empty string')
    }
    if (!isNonEmptyString(input.topology.world.name)) {
      addError(errors, 'topology.world.name', 'must be a non-empty string')
    }
  }

  const domains = validateDomains(errors, input.topology.domains)
  const domainIds = new Set(domains.map((domain) => domain.id))

  if (!Array.isArray(input.topology.districts)) {
    addError(errors, 'topology.districts', 'must be an array')
  } else {
    input.topology.districts.forEach((district, index) => {
      const path = `topology.districts[${index}]`
      if (!isObject(district)) {
        addError(errors, path, 'must be an object')
        return
      }
      if (!isNonEmptyString(district.id)) {
        addError(errors, `${path}.id`, 'must be a non-empty string')
      }
      if (!hasReference(domainIds, district.domainId)) {
        addError(errors, `${path}.domainId`, 'must reference an existing domain')
      }
      if (!isNonEmptyString(district.name)) {
        addError(errors, `${path}.name`, 'must be a non-empty string')
      }
      if (!isNonEmptyString(district.pathPrefix)) {
        addError(errors, `${path}.pathPrefix`, 'must be a non-empty string')
      }
      if (!isNumber(district.confidence) || district.confidence < 0 || district.confidence > 1) {
        addError(errors, `${path}.confidence`, 'must be a number between 0 and 1')
      }
    })
  }

  const districtIds = new Set(
    Array.isArray(input.topology.districts)
      ? input.topology.districts
          .filter((district): district is Record<string, unknown> => isObject(district))
          .map((district) => district.id)
          .filter(isNonEmptyString)
      : [],
  )

  if (!Array.isArray(input.topology.artifacts)) {
    addError(errors, 'topology.artifacts', 'must be an array')
  } else {
    input.topology.artifacts.forEach((artifact, index) => {
      const path = `topology.artifacts[${index}]`
      if (!isObject(artifact)) {
        addError(errors, path, 'must be an object')
        return
      }

      if (!isNonEmptyString(artifact.id)) {
        addError(errors, `${path}.id`, 'must be a non-empty string')
      }
      if (!hasReference(domainIds, artifact.domainId)) {
        addError(errors, `${path}.domainId`, 'must reference an existing domain')
      }
      if (!hasReference(districtIds, artifact.districtId)) {
        addError(errors, `${path}.districtId`, 'must reference an existing district')
      }
      checkStringEnum(errors, `${path}.kind`, artifact.kind, UNIVERSAL_ARTIFACT_KIND)
      if (!isNonEmptyString(artifact.ref)) {
        addError(errors, `${path}.ref`, 'must be a non-empty string')
      }
    })
  }

  if (isObject(input.topology.layout) && Array.isArray(input.topology.layout.domainPositions)) {
    input.topology.layout.domainPositions.forEach((position, index) => {
      const path = `topology.layout.domainPositions[${index}]`
      if (!isObject(position)) {
        addError(errors, path, 'must be an object')
        return
      }

      if (!hasReference(domainIds, position.domainId)) {
        addError(errors, `${path}.domainId`, 'must reference an existing domain')
      }
      if (!isNumber(position.x)) {
        addError(errors, `${path}.x`, 'must be a number')
      }
      if (!isNumber(position.y)) {
        addError(errors, `${path}.y`, 'must be a number')
      }
    })
  }

  if (!Array.isArray(input.actors)) {
    addError(errors, 'actors', 'must be an array')
  }

  const actorIds = new Set<string>()
  if (Array.isArray(input.actors)) {
    input.actors.forEach((actor, index) => {
      const path = `actors[${index}]`
      if (!isObject(actor)) {
        addError(errors, path, 'must be an object')
        return
      }

      if (!isNonEmptyString(actor.id)) {
        addError(errors, `${path}.id`, 'must be a non-empty string')
      } else if (actorIds.has(actor.id)) {
        addError(errors, `${path}.id`, 'must be unique')
      } else {
        actorIds.add(actor.id)
      }

      checkStringEnum(errors, `${path}.kind`, actor.kind, UNIVERSAL_ACTOR_KIND)
      if (!isNonEmptyString(actor.name)) {
        addError(errors, `${path}.name`, 'must be a non-empty string')
      }
    })
  }

  const events = validateEvents(errors, input.events, actorIds)
  const eventIds = new Set(events.map((event) => event.id))

  if (isObject(input.run) && isNonEmptyString(input.run.initialFocusDomainId) && !domainIds.has(input.run.initialFocusDomainId)) {
    addError(errors, 'run.initialFocusDomainId', 'must reference an existing domain')
  }

  if (!Array.isArray(input.interactions)) {
    addError(errors, 'interactions', 'must be an array')
  } else {
    input.interactions.forEach((interaction, index) => {
      const path = `interactions[${index}]`
      if (!isObject(interaction)) {
        addError(errors, path, 'must be an object')
        return
      }

      if (!isNonEmptyString(interaction.id)) {
        addError(errors, `${path}.id`, 'must be a non-empty string')
      }
      checkStringEnum(errors, `${path}.type`, interaction.type, UNIVERSAL_INTERACTION_TYPE)
      if (!hasReference(actorIds, interaction.fromActorId)) {
        addError(errors, `${path}.fromActorId`, 'must reference an existing actor')
      }
      if (!hasReference(actorIds, interaction.toActorId)) {
        addError(errors, `${path}.toActorId`, 'must reference an existing actor')
      }
      if (interaction.eventId !== undefined && !hasReference(eventIds, interaction.eventId)) {
        addError(errors, `${path}.eventId`, 'must reference an existing event')
      }
      if (interaction.fromDomainId !== undefined && !hasReference(domainIds, interaction.fromDomainId)) {
        addError(errors, `${path}.fromDomainId`, 'must reference an existing domain')
      }
      if (interaction.toDomainId !== undefined && !hasReference(domainIds, interaction.toDomainId)) {
        addError(errors, `${path}.toDomainId`, 'must reference an existing domain')
      }
    })
  }

  if (!Array.isArray(input.issues)) {
    addError(errors, 'issues', 'must be an array')
  } else {
    input.issues.forEach((issue, index) => {
      const path = `issues[${index}]`
      if (!isObject(issue)) {
        addError(errors, path, 'must be an object')
        return
      }

      if (!isNonEmptyString(issue.id)) {
        addError(errors, `${path}.id`, 'must be a non-empty string')
      }
      checkStringEnum(errors, `${path}.severity`, issue.severity, UNIVERSAL_ISSUE_SEVERITY)
      checkStringEnum(errors, `${path}.status`, issue.status, UNIVERSAL_ISSUE_STATUS)
      if (!isNonEmptyString(issue.summary)) {
        addError(errors, `${path}.summary`, 'must be a non-empty string')
      }
      if (checkIdArray(errors, `${path}.linkedEventIds`, issue.linkedEventIds)) {
        issue.linkedEventIds.forEach((eventId, linkedIndex) => {
          if (!eventIds.has(eventId)) {
            addError(errors, `${path}.linkedEventIds[${linkedIndex}]`, 'must reference an existing event')
          }
        })
      }
      if (issue.linkedActorIds !== undefined && checkIdArray(errors, `${path}.linkedActorIds`, issue.linkedActorIds)) {
        issue.linkedActorIds.forEach((actorId, linkedIndex) => {
          if (!actorIds.has(actorId)) {
            addError(errors, `${path}.linkedActorIds[${linkedIndex}]`, 'must reference an existing actor')
          }
        })
      }
      if (issue.domainId !== undefined && !hasReference(domainIds, issue.domainId)) {
        addError(errors, `${path}.domainId`, 'must reference an existing domain')
      }
      if (issue.districtId !== undefined && !hasReference(districtIds, issue.districtId)) {
        addError(errors, `${path}.districtId`, 'must reference an existing district')
      }
    })
  }

  if (!isObject(input.privacy)) {
    addError(errors, 'privacy', 'must be an object')
  } else {
    if (!isNonEmptyString(input.privacy.policy)) {
      addError(errors, 'privacy.policy', 'must be a non-empty string')
    }
    if (!isObject(input.privacy.redactions)) {
      addError(errors, 'privacy.redactions', 'must be an object')
    } else {
      if (typeof input.privacy.redactions.thinkingContent !== 'boolean') {
        addError(errors, 'privacy.redactions.thinkingContent', 'must be a boolean')
      }
      checkStringEnum(
        errors,
        'privacy.redactions.toolOutputContent',
        input.privacy.redactions.toolOutputContent,
        UNIVERSAL_TOOL_OUTPUT_POLICY,
      )
      if (typeof input.privacy.redactions.secretPatternsApplied !== 'boolean') {
        addError(errors, 'privacy.redactions.secretPatternsApplied', 'must be a boolean')
      }
    }
  }

  if (options.requireShareablePrivacy) {
    const importSection = isObject(input.run) && isObject(input.run.import) ? input.run.import : null
    const redactions = isObject(input.privacy) && isObject(input.privacy.redactions) ? input.privacy.redactions : null
    if (!importSection || importSection.exportMode !== 'shareable') {
      addError(errors, 'run.import.exportMode', 'must be "shareable" when requireShareablePrivacy is enabled')
    }
    if (!redactions || redactions.thinkingContent !== true) {
      addError(errors, 'privacy.redactions.thinkingContent', 'must be true for shareable exports')
    }
    if (!redactions || redactions.toolOutputContent !== 'hashed') {
      addError(errors, 'privacy.redactions.toolOutputContent', 'must be "hashed" for shareable exports')
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  return {
    ok: true,
    errors: [],
    value: input as unknown as UniversalEventsPackage,
  }
}

export function assertUniversalEventsPackage(
  input: unknown,
  options?: UniversalValidationOptions,
): UniversalEventsPackage {
  const result = validateUniversalEventsPackage(input, options)
  if (!result.ok || !result.value) {
    const message = result.errors.map((error) => `${error.path}: ${error.message}`).join('\n')
    throw new Error(`Universal events validation failed:\n${message}`)
  }
  return result.value
}
