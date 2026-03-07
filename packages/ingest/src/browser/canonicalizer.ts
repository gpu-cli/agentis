// ============================================================================
// Phase 1: Canonicalizer — Records → CanonicalWorkModel
// No geometry, no Pixi types. Pure work semantics.
// ============================================================================

import type {
  CanonicalWorkModel,
  CanonicalOperation,
  OperationKind,
  ActorRef,
  ProjectMeta,
  RepoMeta,
  BranchMeta,
} from '@multiverse/world-model'

import type { BrowserParsedRecord } from './parser'
import {
  getRecordTimestamp,
  getRecordBlocks,
  getProgressNestedBlocks,
  getProgressDataType,
} from './parser'
import { scrubSecrets } from './privacy'

// ---------------------------------------------------------------------------
// Tool name → OperationKind mapping
// ---------------------------------------------------------------------------

const TOOL_KIND_MAP: Record<string, OperationKind> = {
  Read: 'file_read',
  Write: 'file_write',
  Edit: 'file_write',
  MultiEdit: 'file_write',
  Bash: 'command_run',
  Grep: 'search',
  Glob: 'search',
  Task: 'task_spawn',
  Agent: 'task_spawn',
  TaskOutput: 'task_complete',
  TaskCreate: 'workitem_create',
  TaskUpdate: 'workitem_update',
  AskUserQuestion: 'conversation',
  Skill: 'command_run',
  NotebookEdit: 'file_write',
  WebFetch: 'web_fetch',
  TodoRead: 'file_read',
  TodoWrite: 'file_write',
}

function classifyTool(toolName: string): OperationKind {
  return TOOL_KIND_MAP[toolName] ?? 'unknown'
}

// ---------------------------------------------------------------------------
// Actor derivation
// ---------------------------------------------------------------------------

function deriveActorFromRecord(record: Record<string, unknown>): ActorRef {
  // Humans
  if (record.type === 'user') {
    return { id: 'actor_user', kind: 'human', parentId: null, name: 'User' }
  }

  // Prefer explicit agent IDs from transcript
  // 1) Progress records: nested data.agentId (teams/sidechain)
  if (record.type === 'progress') {
    const data = record.data
    if (typeof data === 'object' && data !== null) {
      const dataAgentId = (data as Record<string, unknown>).agentId
      if (typeof dataAgentId === 'string' && dataAgentId.length > 0) {
        return {
          id: `actor_sub_${dataAgentId}`,
          kind: 'subagent',
          parentId: 'actor_main',
          name: `Subagent ${dataAgentId.slice(0, 6)}`,
        }
      }
    }
  }

  // 2) Assistant (and other) records: top-level agentId and isSidechain flags
  const topAgentId = (record as Record<string, unknown>).agentId
  if (typeof topAgentId === 'string' && topAgentId.length > 0) {
    // Treat as subagent initially to allow promotion to full agent later
    return {
      id: `actor_sub_${topAgentId}`,
      kind: 'subagent',
      parentId: 'actor_main',
      name: `Subagent ${topAgentId.slice(0, 6)}`,
    }
  }

  // Default: single-agent transcript (Claude)
  return { id: 'actor_main', kind: 'agent', parentId: null, name: 'Claude' }
}

// ---------------------------------------------------------------------------
// Path extraction from tool inputs
// ---------------------------------------------------------------------------

function extractPathFromInput(input: Record<string, unknown>): string | null {
  for (const key of ['file_path', 'filePath', 'path']) {
    const val = input[key]
    if (typeof val === 'string' && val.length > 0) return val
  }
  return null
}

function extractPathFromCommand(command: string): string | null {
  const match = /(?:^|\s)(\/[^\s;|&><"']+\.[a-zA-Z]{1,10})/u.exec(command)
  return match?.[1] ?? null
}

// ---------------------------------------------------------------------------
// Repo / branch inference
// ---------------------------------------------------------------------------

function inferRepos(records: BrowserParsedRecord[]): RepoMeta[] {
  const cwdCounts = new Map<string, number>()

  for (const item of records) {
    const cwd = item.record.cwd
    if (typeof cwd === 'string' && cwd.length > 0) {
      cwdCounts.set(cwd, (cwdCounts.get(cwd) ?? 0) + 1)
    }
  }

  if (cwdCounts.size === 0) return []

  // Deduplicate: subdirectories of an existing root are districts, not separate repos.
  // Sort by path length so shorter (parent) roots are processed first.
  const sorted = [...cwdCounts.entries()].sort((a, b) => a[0].length - b[0].length)
  const roots: string[] = []
  for (const [cwd] of sorted) {
    const normalized = cwd.replace(/\/+$/u, '')
    const isSubDir = roots.some((root) => normalized.startsWith(`${root}/`))
    if (!isSubDir) roots.push(normalized)
  }

  // Sort deduplicated roots by frequency (most referenced first = primary)
  roots.sort((a, b) => (cwdCounts.get(b) ?? 0) - (cwdCounts.get(a) ?? 0))

  return roots.map((root) => {
    const parts = root.replace(/\\/gu, '/').split('/')
    const name = parts[parts.length - 1] ?? root

    return {
      root,
      name,
      inferredFrom: 'cwd' as const,
      branches: inferBranches(records, root),
    }
  })
}

function inferBranches(records: BrowserParsedRecord[], _repoRoot: string): BranchMeta[] {
  const branchSet = new Set<string>()

  for (const item of records) {
    const branch = item.record.gitBranch
    if (typeof branch === 'string' && branch.length > 0) {
      branchSet.add(branch)
    }
  }

  return [...branchSet].map(name => ({
    name,
    isMain: isMainBranch(name),
    confidence: isMainBranch(name) ? 'convention' as const : 'guess' as const,
  }))
}

function isMainBranch(name: string): boolean {
  const lower = name.toLowerCase()
  return lower === 'main' || lower === 'master' || lower === 'trunk'
}

// ---------------------------------------------------------------------------
// Timestamp parsing
// ---------------------------------------------------------------------------

function parseTs(record: Record<string, unknown>): number {
  const raw = getRecordTimestamp(record)
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

// ---------------------------------------------------------------------------
// Main canonicalizer
// ---------------------------------------------------------------------------

let opCounter = 0

function makeOpId(): string {
  return `op_${(opCounter++).toString(36).padStart(6, '0')}`
}

/**
 * Convert parsed transcript records into a CanonicalWorkModel.
 * Pure function (except for the op counter). No geometry, no Pixi types.
 */
export function canonicalize(
  projectName: string,
  records: BrowserParsedRecord[],
): CanonicalWorkModel {
  opCounter = 0

  const operations: CanonicalOperation[] = []
  const actorMap = new Map<string, ActorRef>()
  const observedPaths = new Set<string>()
  let timeMin = Infinity
  let timeMax = 0

  // Track per-actor tool operation counts for promotion decisions
  const actorToolCounts = new Map<string, number>()
  // Track per-actor prompts from progress records
  const actorPrompts = new Map<string, string>()

  // Infer repos and branches
  const repos = inferRepos(records)
  const defaultRepoRoot = repos[0]?.root ?? ''

  for (const item of records) {
    const record = item.record
    const ts = parseTs(record)
    timeMin = Math.min(timeMin, ts)
    timeMax = Math.max(timeMax, ts)

    const recordType = typeof record.type === 'string' ? record.type : ''
    const branch = typeof record.gitBranch === 'string' ? record.gitBranch : null

    // Skip file-history-snapshot records (metadata, not work)
    if (recordType === 'file-history-snapshot') continue

    // --- User records ---
    if (recordType === 'user') {
      const actor = deriveActorFromRecord(record)
      actorMap.set(actor.id, actor)

      const blocks = getRecordBlocks(record)
      for (const block of blocks) {
        if (typeof block.type === 'string' && block.type === 'text') {
          const text = typeof block.text === 'string' ? block.text : ''
          if (text.trim().length > 0) {
            operations.push({
              id: makeOpId(),
              timestamp: ts,
              actor,
              kind: 'conversation',
              targetPath: null,
              repoRoot: defaultRepoRoot,
              branch,
              toolName: null,
              summary: scrubSecrets(text.slice(0, 200)),
              rawRef: { file: item.fileName, line: item.line },
            })
          }
        }
        // Mark preceding tool_use operation as error when tool_result has is_error
        if (typeof block.type === 'string' && block.type === 'tool_result' && block.is_error === true) {
          const toolUseId = typeof block.tool_use_id === 'string' ? block.tool_use_id : undefined
          // Walk backwards to find the matching tool_use op and mark it
          if (toolUseId) {
            for (let oi = operations.length - 1; oi >= 0; oi--) {
              const prevOp = operations[oi]!
              if (prevOp.kind === 'command_run' || prevOp.kind === 'file_read' || prevOp.kind === 'search' || prevOp.kind === 'file_write' || prevOp.kind === 'file_create') {
                prevOp.isError = true
                break
              }
            }
          }
        }
      }
      continue
    }

    // --- Assistant records ---
    if (recordType === 'assistant') {
      const actor = deriveActorFromRecord(record)
      actorMap.set(actor.id, actor)

      const blocks = getRecordBlocks(record)
      for (const block of blocks) {
        const blockType = typeof block.type === 'string' ? block.type : ''

        if (blockType === 'text') {
          operations.push({
            id: makeOpId(),
            timestamp: ts,
            actor,
            kind: 'conversation',
            targetPath: null,
            repoRoot: defaultRepoRoot,
            branch,
            toolName: null,
            summary: scrubSecrets((typeof block.text === 'string' ? block.text : '').slice(0, 200)),
            rawRef: { file: item.fileName, line: item.line },
          })
          continue
        }

        if (blockType === 'thinking') {
          operations.push({
            id: makeOpId(),
            timestamp: ts,
            actor,
            kind: 'reasoning',
            targetPath: null,
            repoRoot: defaultRepoRoot,
            branch,
            toolName: null,
            summary: null,
            rawRef: { file: item.fileName, line: item.line },
          })
          continue
        }

        if (blockType === 'tool_use') {
          const op = processToolUse(block, ts, actor, defaultRepoRoot, branch, item, observedPaths)
          if (op) operations.push(op)
          // Track tool use counts for promotion on assistant records with explicit agent attribution
          if (actor.kind === 'subagent') {
            actorToolCounts.set(actor.id, (actorToolCounts.get(actor.id) ?? 0) + 1)
          }
          continue
        }

        // tool_result blocks are informational, we don't need separate ops for them
      }
      continue
    }

    // --- Progress records ---
    if (recordType === 'progress') {
      const progressType = getProgressDataType(record)
      if (progressType === 'hook_progress') continue // system noise

      const { blocks, agentId } = getProgressNestedBlocks(record)
      const actor = agentId
        ? { id: `actor_sub_${agentId}`, kind: 'subagent' as const, parentId: 'actor_main', name: `Subagent ${agentId.slice(0, 6)}` }
        : deriveActorFromRecord(record)
      actorMap.set(actor.id, actor)

      // Extract prompt from progress data for agent name derivation
      if (agentId) {
        const data = record.data as Record<string, unknown> | undefined
        if (data && typeof data.prompt === 'string' && !actorPrompts.has(actor.id)) {
          actorPrompts.set(actor.id, data.prompt)
        }
      }

      for (const block of blocks) {
        const blockType = typeof block.type === 'string' ? block.type : ''

        if (blockType === 'text') {
          const text = typeof block.text === 'string' ? block.text : ''
          if (text.trim().length > 0) {
            operations.push({
              id: makeOpId(),
              timestamp: ts,
              actor,
              kind: 'conversation',
              targetPath: null,
              repoRoot: defaultRepoRoot,
              branch,
              toolName: null,
              summary: scrubSecrets(text.slice(0, 200)),
              rawRef: { file: item.fileName, line: item.line },
            })
          }
          continue
        }

        if (blockType === 'thinking') {
          operations.push({
            id: makeOpId(),
            timestamp: ts,
            actor,
            kind: 'reasoning',
            targetPath: null,
            repoRoot: defaultRepoRoot,
            branch,
            toolName: null,
            summary: null,
            rawRef: { file: item.fileName, line: item.line },
          })
          continue
        }

        if (blockType === 'tool_use') {
          const op = processToolUse(block, ts, actor, defaultRepoRoot, branch, item, observedPaths)
          if (op) {
            operations.push(op)
            // Track tool use counts for promotion
            actorToolCounts.set(actor.id, (actorToolCounts.get(actor.id) ?? 0) + 1)
          }
          continue
        }
      }
      continue
    }

    // --- Queue operation records ---
    if (recordType === 'queue-operation') {
      const operation = typeof record.operation === 'string' ? record.operation : ''
      if (operation === 'enqueue') {
        const content = typeof record.content === 'string' ? record.content : ''
        // Parse <task-notification> content for task completions
        const taskIdMatch = /<task-notification[^>]*task-id="([^"]+)"/u.exec(content)
        const statusMatch = /status="([^"]+)"/u.exec(content)
        if (taskIdMatch) {
          const taskId = taskIdMatch[1]
          const status = statusMatch?.[1] ?? 'unknown'
          operations.push({
            id: makeOpId(),
            timestamp: ts,
            actor: { id: 'actor_main', kind: 'agent', parentId: null, name: 'Claude' },
            kind: status === 'completed' ? 'task_complete' : 'conversation',
            targetPath: null,
            repoRoot: defaultRepoRoot,
            branch,
            toolName: null,
            summary: `Task ${taskId} ${status}`,
            rawRef: { file: item.fileName, line: item.line },
          })
        }
      }
      continue
    }
  }

  // -----------------------------------------------------------------------
  // Post-processing: promote team agents and assign friendly names
  // -----------------------------------------------------------------------
  const PROMOTION_THRESHOLD = 3 // minimum tool operations to promote
  let promotedIndex = 0
  for (const [actorId, actor] of actorMap) {
    if (actor.kind !== 'subagent') continue

    const toolCount = actorToolCounts.get(actorId) ?? 0
    if (toolCount >= PROMOTION_THRESHOLD) {
      // Promote to full agent
      actor.kind = 'agent'

      // Assign a friendly display name + store prompt for tooltips
      actor.name = getFriendlyAgentName(promotedIndex++)
      const prompt = actorPrompts.get(actorId)
      if (prompt) {
        actor.prompt = prompt
      }
    }
  }

  // Compute filesPerTile
  const observedFileCount = observedPaths.size
  const filesPerTile = observedFileCount > 10_000 ? 10 : 1

  const project: ProjectMeta = {
    name: projectName,
    nameConfidence: 'user_provided',
    repos,
    observedFileCount,
    source: {
      format: 'claude_code_jsonl',
      recordCount: records.length,
      timeRange: {
        start: timeMin === Infinity ? 0 : timeMin,
        end: timeMax,
      },
    },
  }

  return {
    project,
    actors: [...actorMap.values()],
    operations,
    filesPerTile,
  }
}

// ---------------------------------------------------------------------------
// Friendly agent naming
// ---------------------------------------------------------------------------

/** Friendly names for team agents — short, distinct, easy to read on a map */
const FRIENDLY_AGENT_NAMES = [
  'Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon',
  'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa',
  'Lambda', 'Mu', 'Nu', 'Xi', 'Omicron',
  'Pi', 'Rho', 'Sigma', 'Tau', 'Upsilon',
  'Phi', 'Chi', 'Psi', 'Omega',
]

function getFriendlyAgentName(index: number): string {
  if (index < FRIENDLY_AGENT_NAMES.length) {
    return FRIENDLY_AGENT_NAMES[index]!
  }
  return `Agent ${index + 1}`
}

// ---------------------------------------------------------------------------
// Tool use processing helper
// ---------------------------------------------------------------------------

function processToolUse(
  block: Record<string, unknown>,
  ts: number,
  actor: ActorRef,
  defaultRepoRoot: string,
  branch: string | null,
  item: BrowserParsedRecord,
  observedPaths: Set<string>,
): CanonicalOperation | null {
  const toolName = typeof block.name === 'string' ? block.name : null
  const input = typeof block.input === 'object' && block.input !== null
    ? block.input as Record<string, unknown>
    : null

  const kind = toolName ? classifyTool(toolName) : 'unknown'

  // Extract target path
  let targetPath: string | null = null
  if (input) {
    targetPath = extractPathFromInput(input)
    if (!targetPath && typeof input.command === 'string') {
      targetPath = extractPathFromCommand(input.command)
    }
  }

  if (targetPath) {
    observedPaths.add(targetPath)
  }

  // Build summary from essential input fields
  let summary: string | null = null
  if (input) {
    const parts: string[] = []
    if (toolName) parts.push(toolName)
    if (targetPath) parts.push(targetPath)
    if (typeof input.pattern === 'string') parts.push(`pattern:${input.pattern}`)
    if (typeof input.command === 'string') parts.push(input.command.slice(0, 100))
    summary = parts.length > 0 ? scrubSecrets(parts.join(' ')) : null
  }

  // Detect merge/branch operations from bash commands
  let actualKind = kind
  if (kind === 'command_run' && typeof input?.command === 'string') {
    const cmd = input.command as string
    if (/git\s+merge\b/iu.test(cmd) || /gh\s+pr\s+merge/iu.test(cmd)) {
      actualKind = 'merge'
    } else if (/git\s+(checkout|switch)\b/iu.test(cmd)) {
      actualKind = 'branch_switch'
    }
  }

  return {
    id: `op_${(opCounter++).toString(36).padStart(6, '0')}`,
    timestamp: ts,
    actor,
    kind: actualKind,
    targetPath,
    repoRoot: defaultRepoRoot,
    branch,
    toolName,
    summary,
    rawRef: { file: item.fileName, line: item.line },
  }
}
