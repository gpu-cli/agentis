import { createHash } from 'node:crypto'

import type {
  UniversalEvent,
  UniversalEventCategory,
  UniversalEventStatus,
  UniversalEventTarget,
} from '@multiverse/shared'

import type { ClaudeParsedRecord } from './parser'

interface NormalizedDraft {
  ts: string
  actorId: string
  category: UniversalEventCategory
  action: string
  status: UniversalEventStatus
  target?: UniversalEventTarget | null
  context?: Record<string, unknown> | null
  correlationId?: string | null
  parentEventId?: string | null
  redacted: boolean
  rawRef?: {
    path: string
    line: number
  }
}

function toRawRef(parsed: ClaudeParsedRecord): { path: string; line: number } {
  return {
    path: parsed.location.filePath,
    line: parsed.location.line,
  }
}

interface PendingToolCall {
  toolName?: string
  actorId: string
}

function stableHash(value: string): string {
  return createHash('sha1').update(value).digest('hex')
}

function getTimestamp(record: Record<string, unknown>): string {
  const ts = typeof record.ts === 'string' ? record.ts : typeof record.timestamp === 'string' ? record.timestamp : null
  if (ts) {
    return ts
  }
  return new Date(0).toISOString()
}

function getRecordContent(record: Record<string, unknown>): unknown[] {
  const message = record.message
  if (typeof message === 'object' && message !== null) {
    const messageObj = message as Record<string, unknown>
    if (Array.isArray(messageObj.content)) {
      return messageObj.content
    }
  }

  if (Array.isArray(record.content)) {
    return record.content
  }

  return []
}

function getActorId(record: Record<string, unknown>): string {
  if (record.type === 'user') {
    return 'actor_user'
  }

  const rawAgentId = typeof record.agentId === 'string' ? record.agentId : typeof record.sessionId === 'string' ? record.sessionId : null
  if (record.isSidechain === true && rawAgentId) {
    return `actor_sub_${rawAgentId}`
  }

  if (rawAgentId && rawAgentId !== 'main') {
    return `actor_agent_${rawAgentId}`
  }

  return 'actor_main'
}

function toContext(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>
  }
  return null
}

function normalizeToolStart(
  record: Record<string, unknown>,
  block: Record<string, unknown>,
  actorId: string,
): NormalizedDraft[] {
  const toolId = typeof block.id === 'string' ? block.id : typeof block.tool_use_id === 'string' ? block.tool_use_id : undefined
  const toolName = typeof block.name === 'string' ? block.name : undefined
  const input = toContext(block.input)
  const correlationId = toolId ? `corr_${toolId}` : null

  const base: NormalizedDraft = {
    ts: getTimestamp(record),
    actorId,
    category: 'tool_call',
    action: 'started',
    status: 'ok',
    target: {
      kind: 'tool',
      id: toolId,
      name: toolName,
    },
    context: input,
    correlationId,
    parentEventId: typeof record.parentUuid === 'string' ? `src_${record.parentUuid}` : null,
    redacted: false,
  }

  const events: NormalizedDraft[] = [base]

  if (toolName === 'Read') {
    events.push({
      ...base,
      category: 'file_change',
      action: 'read',
      target: {
        kind: 'artifact',
        ref: typeof input?.file_path === 'string' ? input.file_path : typeof input?.path === 'string' ? input.path : undefined,
      },
      context: {
        viaTool: 'Read',
      },
      parentEventId: null,
    })
  } else if (toolName === 'Edit') {
    events.push({
      ...base,
      category: 'file_change',
      action: 'edit',
      target: {
        kind: 'artifact',
        ref: typeof input?.file_path === 'string' ? input.file_path : undefined,
      },
      context: {
        viaTool: 'Edit',
      },
      parentEventId: null,
    })
  } else if (toolName === 'Write') {
    events.push({
      ...base,
      category: 'file_change',
      action: typeof input?.append === 'boolean' && input.append ? 'edit' : 'create',
      target: {
        kind: 'artifact',
        ref: typeof input?.file_path === 'string' ? input.file_path : undefined,
      },
      context: {
        viaTool: 'Write',
      },
      parentEventId: null,
    })
  } else if (toolName === 'Grep') {
    events.push({
      ...base,
      category: 'file_change',
      action: 'search',
      context: {
        viaTool: 'Grep',
        pattern: typeof input?.pattern === 'string' ? input.pattern : undefined,
      },
      parentEventId: null,
    })
  } else if (toolName === 'Glob') {
    events.push({
      ...base,
      category: 'file_change',
      action: 'discover',
      context: {
        viaTool: 'Glob',
        pattern: typeof input?.pattern === 'string' ? input.pattern : undefined,
      },
      parentEventId: null,
    })
  } else if (toolName === 'Task') {
    events.push({
      ...base,
      category: 'subagent',
      action: 'spawn',
      target: {
        kind: 'actor',
        id: typeof input?.agentId === 'string' ? `actor_sub_${input.agentId}` : undefined,
      },
      parentEventId: null,
    })
  }

  return events
}

function normalizeToolResult(
  record: Record<string, unknown>,
  block: Record<string, unknown>,
  actorId: string,
  pendingByToolId: Map<string, PendingToolCall>,
): NormalizedDraft | null {
  const toolUseId = typeof block.tool_use_id === 'string' ? block.tool_use_id : undefined
  const pending = toolUseId ? pendingByToolId.get(toolUseId) : undefined
  const status: UniversalEventStatus = block.is_error === true ? 'error' : 'ok'

  if (!toolUseId && !pending) {
    return null
  }

  return {
    ts: getTimestamp(record),
    actorId: pending?.actorId ?? actorId,
    category: 'tool_call',
    action: status === 'error' ? 'failed' : 'completed',
    status,
    target: {
      kind: 'tool',
      id: toolUseId,
      name: pending?.toolName,
    },
    context: {
      resultHash:
        typeof block.content === 'string'
          ? `sha256:${createHash('sha256').update(block.content).digest('hex')}`
          : undefined,
    },
    correlationId: toolUseId ? `corr_${toolUseId}` : null,
    parentEventId: null,
    redacted: false,
  }
}

export function normalizeClaudeRecords(
  records: ClaudeParsedRecord[],
): UniversalEvent[] {
  const drafts: NormalizedDraft[] = []
  const pendingByToolId = new Map<string, PendingToolCall>()

  for (const parsed of records) {
    const record = parsed.record as Record<string, unknown>
    const actorId = getActorId(record)
    const ts = getTimestamp(record)
    const contentBlocks = getRecordContent(record)

    if (record.type === 'assistant' || record.type === 'user') {
      for (const block of contentBlocks) {
        if (typeof block !== 'object' || block === null) {
          continue
        }
        const content = block as Record<string, unknown>
        const blockType = typeof content.type === 'string' ? content.type : null

        if (blockType === 'text') {
          drafts.push({
            ts,
            actorId,
            category: 'conversation',
            action: 'message',
            status: 'ok',
            context: {
              summary:
                typeof content.text === 'string' ? content.text.slice(0, 200) : undefined,
            },
            redacted: false,
            rawRef: toRawRef(parsed),
          })
          continue
        }

        if (blockType === 'thinking') {
          drafts.push({
            ts,
            actorId,
            category: 'reasoning',
            action: 'note',
            status: 'ok',
            context: {
              summary: '[redacted]',
            },
            redacted: true,
            rawRef: toRawRef(parsed),
          })
          continue
        }

        if (blockType === 'tool_use') {
          const toolEvents = normalizeToolStart(record, content, actorId)
          for (const toolEvent of toolEvents) {
            drafts.push({
              ...toolEvent,
              rawRef: toRawRef(parsed),
            })
          }

          const toolId = typeof content.id === 'string' ? content.id : typeof content.tool_use_id === 'string' ? content.tool_use_id : null
          if (toolId) {
            pendingByToolId.set(toolId, {
              toolName: typeof content.name === 'string' ? content.name : undefined,
              actorId,
            })
          }
          continue
        }

        if (blockType === 'tool_result') {
          const resultEvent = normalizeToolResult(record, content, actorId, pendingByToolId)
          if (resultEvent) {
            drafts.push({
              ...resultEvent,
              rawRef: toRawRef(parsed),
            })
          }
        }
      }
      continue
    }

    if (record.type === 'progress') {
      drafts.push({
        ts,
        actorId,
        category: 'progress',
        action: 'update',
        status: 'ok',
        context: toContext(record.data) ?? {
          progressType: typeof record.progressType === 'string' ? record.progressType : undefined,
          parentToolUseID:
            typeof record.parentToolUseID === 'string' ? record.parentToolUseID : undefined,
        },
        correlationId:
          typeof record.parentToolUseID === 'string' ? `corr_${record.parentToolUseID}` : null,
        redacted: false,
        rawRef: toRawRef(parsed),
      })
      continue
    }

    if (record.type === 'system') {
      drafts.push({
        ts,
        actorId,
        category: 'system',
        action: 'turn_complete',
        status: 'ok',
        context: toContext(record),
        redacted: false,
        rawRef: toRawRef(parsed),
      })
      continue
    }

    if (record.type === 'summary') {
      drafts.push({
        ts,
        actorId,
        category: 'system',
        action: 'compaction',
        status: 'ok',
        context: toContext(record),
        redacted: false,
        rawRef: toRawRef(parsed),
      })
      continue
    }

    if (record.type === 'file-history-snapshot') {
      drafts.push({
        ts,
        actorId,
        category: 'checkpoint',
        action: 'snapshot',
        status: 'ok',
        context: toContext(record),
        redacted: false,
        rawRef: toRawRef(parsed),
      })
      continue
    }

    if (record.type === 'queue-operation') {
      const queueAction = typeof record.action === 'string' ? record.action : typeof record.status === 'string' ? record.status : 'queued'
      const mappedAction =
        queueAction === 'start'
          ? 'started'
          : queueAction === 'complete'
            ? 'completed'
            : queueAction === 'fail'
              ? 'failed'
              : 'queued'
      drafts.push({
        ts,
        actorId,
        category: 'background_task',
        action: mappedAction,
        status: mappedAction === 'failed' ? 'error' : 'ok',
        context: toContext(record),
        redacted: false,
        rawRef: toRawRef(parsed),
      })
    }
  }

  drafts.sort((a, b) => {
    const tsCompare = a.ts.localeCompare(b.ts)
    if (tsCompare !== 0) {
      return tsCompare
    }

    const aLine = a.rawRef?.line ?? 0
    const bLine = b.rawRef?.line ?? 0
    if (aLine !== bLine) {
      return aLine - bLine
    }

    const aPath = a.rawRef?.path ?? ''
    const bPath = b.rawRef?.path ?? ''
    return aPath.localeCompare(bPath)
  })

  const actorSequence = new Map<string, number>()

  return drafts.map((draft, index) => {
    const currentActorSeq = (actorSequence.get(draft.actorId) ?? 0) + 1
    actorSequence.set(draft.actorId, currentActorSeq)

    const sourceKey = `${draft.rawRef?.path ?? 'unknown'}:${draft.rawRef?.line ?? index + 1}:${draft.category}:${draft.action}:${draft.actorId}`
    const digest = stableHash(sourceKey)

    return {
      id: `evt_${String(index + 1).padStart(6, '0')}`,
      seqGlobal: index + 1,
      actorSeq: currentActorSeq,
      ts: draft.ts,
      actorId: draft.actorId,
      category: draft.category,
      action: draft.action,
      status: draft.status,
      target: draft.target,
      context: draft.context,
      correlationId: draft.correlationId,
      parentEventId: draft.parentEventId,
      dedupeKey: `ue:sha1:${digest.slice(0, 20)}`,
      rawRef: draft.rawRef,
      redacted: draft.redacted,
    }
  })
}
