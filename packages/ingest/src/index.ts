import { createHash } from 'node:crypto'

import {
  UNIVERSAL_EVENTS_SCHEMA,
  type ScenarioData,
  type UniversalActor,
  type UniversalEventsPackage,
} from '@multiverse/shared'

import type {
  ConvertClaudeLogsOptions,
  ConvertClaudeLogsResult,
  ProjectUniversalEventsResult,
} from './types'
import { discoverClaudeSessions } from './claude/discovery'
import { correlateClaudeEvents } from './claude/correlate'
import { inferIssuesFromClaudeEvents } from './claude/errors'
import { inferInteractionsFromClaudeEvents } from './claude/interactions'
import { normalizeClaudeRecords } from './claude/normalize'
import { parseClaudeSessionFiles } from './claude/parser'
import { applyPrivacyRedaction } from './privacy/redact'
import { projectUniversalEventsToScenarioData } from './projectors/to-multiverse'
import { registerArtifacts } from './topology/artifact-registry'
import { inferDistricts } from './topology/district-inference'
import { inferDomains } from './topology/domain-inference'
import { computeInitialFocusDomainId } from './topology/focus'

export type {
  ClaudeDateRange,
  ClaudeSessionDiscoveryOptions,
  ClaudeSessionFile,
  ClaudeSessionManifest,
  ConvertClaudeLogsOptions,
  ConvertClaudeLogsResult,
  ProjectUniversalEventsResult,
} from './types'

export async function convertClaudeLogsToUniversalEvents(
  options: ConvertClaudeLogsOptions,
): Promise<ConvertClaudeLogsResult> {
  const manifest = await discoverClaudeSessions(options.discovery)
  const allInputPaths = manifest.flatMap((entry) => [
    ...entry.mainSessionFiles.map((file) => file.path),
    ...entry.subagentFiles.map((file) => file.path),
  ])

  const parseResult = await parseClaudeSessionFiles(allInputPaths)
  const normalizedEvents = normalizeClaudeRecords(parseResult.records)
  const correlatedEvents = correlateClaudeEvents(normalizedEvents)
  const interactions = inferInteractionsFromClaudeEvents(correlatedEvents)
  const issues = inferIssuesFromClaudeEvents(correlatedEvents)

  const actors = buildActors(correlatedEvents.map((event) => event.actorId), interactions)
  const topology = buildTopology(allInputPaths, correlatedEvents)

  const createdAt = new Date().toISOString()
  const startTs = correlatedEvents[0]?.ts ?? createdAt
  const endTs = correlatedEvents.at(-1)?.ts ?? createdAt
  const runId = manifest[0]?.sessionId ? `run_${manifest[0].sessionId}` : `run_${createHash('sha1').update(createdAt).digest('hex').slice(0, 8)}`

  const replayPackage: UniversalEventsPackage = {
    schema: UNIVERSAL_EVENTS_SCHEMA,
    schemaVersion: 1,
    run: {
      id: runId,
      source: 'claude_code',
      createdAt,
      inputDigest: buildInputDigest(allInputPaths),
      initialFocusDomainId: computeInitialFocusDomainId({
        schema: UNIVERSAL_EVENTS_SCHEMA,
        schemaVersion: 1,
        run: {
          id: runId,
          source: 'claude_code',
          createdAt,
          inputDigest: buildInputDigest(allInputPaths),
          timeRange: { start: startTs, end: endTs },
          import: {
            inputPaths: allInputPaths,
            redactionPolicy: options.redactionPolicy ?? 'default-safe',
            exportMode: options.exportMode,
          },
        },
        topology,
        actors,
        events: correlatedEvents,
        interactions,
        issues,
        privacy: {
          policy: options.redactionPolicy ?? 'default-safe',
          redactions: {
            thinkingContent: true,
            toolOutputContent: 'hashed',
            secretPatternsApplied: true,
          },
        },
      }),
      timeRange: {
        start: startTs,
        end: endTs,
      },
      import: {
        inputPaths: allInputPaths,
        filters: {
          project: options.discovery.projectFilter,
          sessionIds: options.discovery.sessionFilter,
          dateRange: options.discovery.dateRange,
        },
        redactionPolicy: options.redactionPolicy ?? 'default-safe',
        exportMode: options.exportMode,
      },
      sourceMetadata: {
        parseWarningCount: parseResult.warnings.length,
      },
    },
    presentation: {
      labels: {
        domain: 'island',
        district: 'district',
      },
    },
    topology,
    actors,
    events: correlatedEvents,
    interactions,
    issues,
    privacy: {
      policy: options.redactionPolicy ?? 'default-safe',
      redactions: {
        thinkingContent: true,
        toolOutputContent: 'hashed',
        secretPatternsApplied: true,
      },
    },
  }

  const privacyAdjustedPackage = applyPrivacyRedaction(replayPackage)

  return {
    manifest,
    package: privacyAdjustedPackage,
  }
}

export function projectUniversalEventsToMultiverse(
  input: UniversalEventsPackage,
): ProjectUniversalEventsResult {
  return {
    scenario: projectScenarioData(input),
  }
}

export function projectScenarioData(input: UniversalEventsPackage): ScenarioData {
  return projectUniversalEventsToScenarioData(input)
}

function buildInputDigest(paths: string[]): string {
  const normalized = [...paths].sort().join('\n')
  return `sha256:${createHash('sha256').update(normalized).digest('hex')}`
}

function buildActors(actorIds: string[], interactions: UniversalEventsPackage['interactions']): UniversalActor[] {
  const fromInteractions = interactions.flatMap((interaction) => [interaction.fromActorId, interaction.toActorId])
  const unique = [...new Set([...actorIds, ...fromInteractions])]
  return unique.map((actorId) => {
    if (actorId === 'actor_user') {
      return {
        id: actorId,
        kind: 'human',
        name: 'user',
      }
    }

    if (actorId.startsWith('actor_sub_')) {
      return {
        id: actorId,
        kind: 'subagent',
        name: actorId.replace('actor_', ''),
        parentActorId: 'actor_main',
      }
    }

    return {
      id: actorId,
      kind: 'agent',
      name: actorId.replace('actor_', ''),
    }
  })
}

function buildTopology(
  inputPaths: string[],
  events: UniversalEventsPackage['events'],
): UniversalEventsPackage['topology'] {
  const domains = inferDomains(inputPaths)
  const artifactRefs = extractArtifactRefs(events)
  const registeredArtifacts = registerArtifacts(artifactRefs)

  const districts = domains.flatMap((domain) =>
    inferDistricts(
      domain.id,
      artifactRefs.filter((ref) => ref.startsWith(domain.root) || !ref.startsWith('/')),
    ),
  )

  const defaultDistrictByDomain = new Map<string, string>()
  for (const district of districts) {
    if (!defaultDistrictByDomain.has(district.domainId)) {
      defaultDistrictByDomain.set(district.domainId, district.id)
    }
  }

  const artifacts = registeredArtifacts.map((artifact) => {
    const domain = domains.find((candidate) =>
      artifact.ref.startsWith(candidate.root),
    )
    const domainId = domain?.id ?? domains[0].id
    const districtId = defaultDistrictByDomain.get(domainId) ?? districts[0]?.id ?? 'dist_unassigned'

    return {
      ...artifact,
      domainId,
      districtId,
      id: artifact.id.replace('unassigned', domainId),
    }
  })

  const domainPositions = domains.map((domain, index) => ({
    domainId: domain.id,
    x: index * 280 - ((domains.length - 1) * 140),
    y: index % 2 === 0 ? 40 : -20,
    radius: 120,
  }))

  return {
    world: {
      id: 'world_workspace',
      name: 'Workspace',
    },
    domains,
    districts,
    artifacts,
    layout: {
      algorithm: 'domain-row-v1',
      units: 'tile',
      domainPositions,
    },
  }
}

function extractArtifactRefs(events: UniversalEventsPackage['events']): string[] {
  const refs: string[] = []
  for (const event of events) {
    if (typeof event.target?.ref === 'string') {
      refs.push(event.target.ref)
    }
    if (typeof event.context?.artifactRef === 'string') {
      refs.push(event.context.artifactRef)
    }
  }
  return [...new Set(refs)]
}
