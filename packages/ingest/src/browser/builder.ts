// ============================================================================
// Browser-safe event builder — transcript records → UniversalEventsPackage
// Ported from useScenarioReplay.ts buildReplayFromUploadedClaude (lines 1323-1543)
// Uses browser parser/topology/hash/privacy modules (no node:* deps)
// ============================================================================

import type {
  UniversalEvent,
  UniversalEventsPackage,
} from '@multiverse/shared'

import { sha256 } from './hash'
import type { BrowserParsedRecord } from './parser'
import {
  getRecordTimestamp,
  getActorIdFromRecord,
  getRecordBlocks,
  getProgressNestedBlocks,
  getProgressDataType,
} from './parser'
import { extractTopology, extractCwdHints } from './topology'
import { scrubSecrets } from './privacy'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+/u, '')
    .replace(/-+$/u, '') || 'project'
}

/** DJB2 hash for dedupe keys (synchronous, fast) */
function simpleHash(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return hash
}

/** Extract only essential fields from tool input, avoiding giant prompt/context blobs */
function extractMinimalToolContext(input: Record<string, unknown>): Record<string, unknown> {
  const KEEP_KEYS = ['file_path', 'filePath', 'path', 'pattern', 'command', 'description', 'name', 'url', 'content']
  const result: Record<string, unknown> = {}
  for (const key of KEEP_KEYS) {
    if (key in input) {
      const val = input[key]
      // Truncate long string values (e.g. content of file writes)
      if (typeof val === 'string' && val.length > 300) {
        result[key] = val.slice(0, 300) + '...'
      } else {
        result[key] = val
      }
    }
  }
  return Object.keys(result).length > 0 ? result : { toolInput: 'redacted' }
}

function pushEvent(
  events: UniversalEvent[],
  actorSeq: Map<string, number>,
  draft: Omit<UniversalEvent, 'id' | 'seqGlobal' | 'actorSeq' | 'dedupeKey'>,
): void {
  const nextGlobal = events.length + 1
  const nextActorSeq = (actorSeq.get(draft.actorId) ?? 0) + 1
  actorSeq.set(draft.actorId, nextActorSeq)

  const basis = `${draft.actorId}:${draft.category}:${draft.action}:${draft.ts}:${nextGlobal}`
  events.push({
    id: `evt_${String(nextGlobal).padStart(6, '0')}`,
    seqGlobal: nextGlobal,
    actorSeq: nextActorSeq,
    dedupeKey: `ue:sha1:${Math.abs(simpleHash(basis)).toString(16).padStart(8, '0')}`,
    ...draft,
  })
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

/**
 * Build a UniversalEventsPackage from parsed transcript records.
 * This is the browser-safe replacement for the monolith's
 * `buildReplayFromUploadedClaude`.
 *
 * @param projectName  User-provided project label
 * @param files        Original uploaded File[] (for input path metadata)
 * @param records      Pre-parsed records from `parseUploadedFiles()`
 * @returns            The completed package (async because of SHA-256 hashing)
 */
export async function buildReplayPackage(
  projectName: string,
  files: File[],
  records: BrowserParsedRecord[],
): Promise<UniversalEventsPackage> {
  const nowIso = new Date().toISOString()
  const events: UniversalEvent[] = []
  const actorSeq = new Map<string, number>()
  const pendingTools = new Map<string, { actorId: string; toolName?: string }>()
  const actorIds = new Set<string>(['actor_main'])

  // --- 1. Walk records and emit universal events ---
  for (const item of records) {
    const actorId = getActorIdFromRecord(item.record)
    actorIds.add(actorId)
    const ts = getRecordTimestamp(item.record)
    const blocks = getRecordBlocks(item.record)

    if (item.record.type === 'assistant' || item.record.type === 'user') {
      blocks.forEach((block) => {
        const blockType = typeof block.type === 'string' ? block.type : ''

        if (blockType === 'text') {
          const rawText = typeof block.text === 'string' ? block.text : ''
          pushEvent(events, actorSeq, {
            ts,
            actorId,
            category: 'conversation',
            action: 'message',
            status: 'ok',
            context: {
              summary: scrubSecrets(rawText.slice(0, 200)),
            },
            redacted: false,
            rawRef: { path: item.fileName, line: item.line },
          })
          return
        }

        if (blockType === 'thinking') {
          pushEvent(events, actorSeq, {
            ts,
            actorId,
            category: 'reasoning',
            action: 'note',
            status: 'ok',
            context: { summary: '[redacted]' },
            redacted: true,
            rawRef: { path: item.fileName, line: item.line },
          })
          return
        }

        if (blockType === 'tool_use') {
          const toolId = typeof block.id === 'string' ? block.id : undefined
          const toolName = typeof block.name === 'string' ? block.name : undefined
          if (toolId) {
            pendingTools.set(toolId, { actorId, toolName })
          }

          pushEvent(events, actorSeq, {
            ts,
            actorId,
            category: 'tool_call',
            action: 'started',
            status: 'ok',
            target: { kind: 'tool', id: toolId, name: toolName },
            context: (block.input as Record<string, unknown> | undefined) ?? null,
            correlationId: toolId ? `corr_${toolId}` : null,
            redacted: false,
            rawRef: { path: item.fileName, line: item.line },
          })

          if (toolName === 'Task') {
            pushEvent(events, actorSeq, {
              ts,
              actorId,
              category: 'subagent',
              action: 'spawn',
              status: 'ok',
              redacted: false,
              rawRef: { path: item.fileName, line: item.line },
            })
          }
          return
        }

        if (blockType === 'tool_result') {
          const toolUseId = typeof block.tool_use_id === 'string' ? block.tool_use_id : undefined
          const pending = toolUseId ? pendingTools.get(toolUseId) : undefined
          const status = block.is_error === true ? 'error' : 'ok'

          // Hash tool result content using real crypto.subtle (deferred)
          const resultContent = typeof block.content === 'string' ? block.content : undefined

          pushEvent(events, actorSeq, {
            ts,
            actorId: pending?.actorId ?? actorId,
            category: 'tool_call',
            action: status === 'error' ? 'failed' : 'completed',
            status,
            target: { kind: 'tool', id: toolUseId, name: pending?.toolName },
            context: {
              // Placeholder hash — will be replaced below with real SHA-256
              resultHash: resultContent ? `pending:${resultContent.length}` : undefined,
            },
            correlationId: toolUseId ? `corr_${toolUseId}` : null,
            redacted: false,
            rawRef: { path: item.fileName, line: item.line },
          })
        }
      })
      continue
    }

    if (item.record.type === 'progress') {
      const progressDataType = getProgressDataType(item.record)

      // Skip hook_progress — these are system-level hooks, not agent activity
      if (progressDataType === 'hook_progress') continue

      // Extract nested blocks from agent_progress records
      const { blocks: nestedBlocks, agentId: nestedAgentId } = getProgressNestedBlocks(item.record)
      const resolvedActorId = nestedAgentId ? `actor_agent_${nestedAgentId}` : actorId
      actorIds.add(resolvedActorId)

      if (nestedBlocks.length > 0) {
        // Process nested blocks the same way we process assistant blocks
        for (const block of nestedBlocks) {
          const blockType = typeof block.type === 'string' ? block.type : ''

          if (blockType === 'text') {
            const rawText = typeof block.text === 'string' ? block.text : ''
            if (rawText.trim().length === 0) continue
            pushEvent(events, actorSeq, {
              ts,
              actorId: resolvedActorId,
              category: 'conversation',
              action: 'message',
              status: 'ok',
              context: { summary: scrubSecrets(rawText.slice(0, 200)) },
              redacted: false,
              rawRef: { path: item.fileName, line: item.line },
            })
            continue
          }

          if (blockType === 'thinking') {
            pushEvent(events, actorSeq, {
              ts,
              actorId: resolvedActorId,
              category: 'reasoning',
              action: 'note',
              status: 'ok',
              context: { summary: '[redacted]' },
              redacted: true,
              rawRef: { path: item.fileName, line: item.line },
            })
            continue
          }

          if (blockType === 'tool_use') {
            const toolId = typeof block.id === 'string' ? block.id : undefined
            const toolName = typeof block.name === 'string' ? block.name : undefined
            if (toolId) {
              pendingTools.set(toolId, { actorId: resolvedActorId, toolName })
            }

            // Build minimal context (just essential input fields, no giant blobs)
            const rawInput = block.input as Record<string, unknown> | undefined
            const minimalContext = rawInput ? extractMinimalToolContext(rawInput) : null

            pushEvent(events, actorSeq, {
              ts,
              actorId: resolvedActorId,
              category: 'tool_call',
              action: 'started',
              status: 'ok',
              target: { kind: 'tool', id: toolId, name: toolName },
              context: minimalContext,
              correlationId: toolId ? `corr_${toolId}` : null,
              redacted: false,
              rawRef: { path: item.fileName, line: item.line },
            })

            if (toolName === 'Task') {
              pushEvent(events, actorSeq, {
                ts,
                actorId: resolvedActorId,
                category: 'subagent',
                action: 'spawn',
                status: 'ok',
                redacted: false,
                rawRef: { path: item.fileName, line: item.line },
              })
            }
            continue
          }

          if (blockType === 'tool_result') {
            const toolUseId = typeof block.tool_use_id === 'string' ? block.tool_use_id : undefined
            const pending = toolUseId ? pendingTools.get(toolUseId) : undefined
            const status = block.is_error === true ? 'error' : 'ok'

            pushEvent(events, actorSeq, {
              ts,
              actorId: pending?.actorId ?? resolvedActorId,
              category: 'tool_call',
              action: status === 'error' ? 'failed' : 'completed',
              status,
              target: { kind: 'tool', id: toolUseId, name: pending?.toolName },
              context: { resultHash: `pending:nested` },
              correlationId: toolUseId ? `corr_${toolUseId}` : null,
              redacted: false,
              rawRef: { path: item.fileName, line: item.line },
            })
            continue
          }
        }
      }
      // No else — if there were no nested blocks, we simply skip the progress record
      // rather than emitting a giant blob event
      continue
    }

    if (item.record.type === 'system') {
      pushEvent(events, actorSeq, {
        ts,
        actorId,
        category: 'system',
        action: 'turn_complete',
        status: 'ok',
        context: item.record,
        redacted: false,
        rawRef: { path: item.fileName, line: item.line },
      })
    }
  }

  // --- 2. Resolve pending SHA-256 hashes for tool results ---
  // Collect all tool_result blocks that have content for hashing
  // Search both top-level blocks AND nested progress blocks
  // Build a correlation map for O(1) lookup of matching completed/failed events
  const corrToEventIndex = new Map<string, number>()
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!
    if (typeof e.correlationId === 'string' && e.correlationId && e.action !== 'started') {
      corrToEventIndex.set(e.correlationId, i)
    }
  }
  const hashJobs: Array<{ eventIndex: number; content: string }> = []
  for (const item of records) {
    // Collect blocks from both sources
    const topBlocks = getRecordBlocks(item.record)
    const { blocks: nestedBlocks } = item.record.type === 'progress'
      ? getProgressNestedBlocks(item.record)
      : { blocks: [] as Array<Record<string, unknown>> }
    const allBlocks = [...topBlocks, ...nestedBlocks]

    for (const block of allBlocks) {
      if (typeof block.type === 'string' && block.type === 'tool_result' && typeof block.content === 'string') {
        // Find the matching event by correlation ID
        const toolUseId = typeof block.tool_use_id === 'string' ? block.tool_use_id : undefined
        if (toolUseId) {
          const eventIndex = corrToEventIndex.get(`corr_${toolUseId}`) ?? -1
          if (eventIndex >= 0) {
            hashJobs.push({ eventIndex, content: block.content })
          }
        }
      }
    }
  }

  // Batch hash all tool results
  if (hashJobs.length > 0) {
    const hashes = await Promise.all(hashJobs.map((job) => sha256(job.content)))
    for (let i = 0; i < hashJobs.length; i++) {
      const event = events[hashJobs[i]!.eventIndex]!
      if (event.context) {
        event.context.resultHash = hashes[i]
      }
    }
  }

  // --- 3. Extract topology ---
  const topology = extractTopology(projectName, records)

  // --- 4. Build actors ---
  const actors = [...actorIds].map((id): UniversalEventsPackage['actors'][number] => {
    if (id === 'actor_user') {
      return { id, kind: 'human', name: 'user' }
    }
    if (id.startsWith('actor_sub_')) {
      return { id, kind: 'subagent', name: id.replace('actor_', ''), parentActorId: 'actor_main' }
    }
    return { id, kind: 'agent', name: id.replace('actor_', '') }
  })

  // --- 5. Build issues from error events ---
  const issues = events
    .filter((event) => event.status === 'error')
    .map((event, index) => ({
      id: `iss_${String(index + 1).padStart(3, '0')}`,
      severity: 'error' as const,
      status: 'open' as const,
      summary: `${event.category}:${event.action} failed`,
      linkedEventIds: [event.id],
      linkedActorIds: [event.actorId],
      domainId: topology.primaryDomainId,
    }))

  // --- 6. Compute input digest ---
  const inputNames = files.map((file) => `/workspace/uploads/${file.name}`)
  const inputDigest = await sha256(inputNames.sort().join('\n'))

  // --- 7. Time range ---
  const start = events[0]?.ts ?? nowIso
  const end = events.length > 0 ? events[events.length - 1]!.ts : nowIso

  // --- 8. Assemble package ---
  const replayPackage: UniversalEventsPackage = {
    schema: 'universal-events',
    schemaVersion: 1,
    run: {
      id: `run_${slugify(projectName || 'project')}`,
      source: 'claude_code',
      createdAt: nowIso,
      inputDigest,
      initialFocusDomainId: topology.primaryDomainId,
      timeRange: { start, end },
      import: {
        inputPaths: inputNames,
        redactionPolicy: 'default-safe',
        exportMode: 'shareable',
      },
      sourceMetadata: {
        uploadedFileCount: files.length,
        cwdHints: extractCwdHints(records),
        gitBranchHints: records
          .map((r) => r.record.gitBranch)
          .filter((b): b is string => typeof b === 'string')
          .filter((b, i, arr) => arr.indexOf(b) === i),
      },
    },
    presentation: {
      labels: { domain: 'island', district: 'district' },
    },
    topology: {
      world: { id: 'world_workspace', name: projectName || 'Workspace' },
      domains: topology.domains,
      districts: topology.districts,
      artifacts: topology.artifacts,
      layout: topology.layout,
    },
    actors,
    events,
    interactions: [],
    issues,
    privacy: {
      policy: 'default-safe',
      redactions: {
        thinkingContent: true,
        toolOutputContent: 'hashed',
        secretPatternsApplied: true,
        absolutePathsRedacted: true,
        actorNamesPseudonymized: true,
      },
    },
  }

  return replayPackage
}
