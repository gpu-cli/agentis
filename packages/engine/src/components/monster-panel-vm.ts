// ============================================================================
// Monster Panel View-Model — Pure logic for classifying errors and computing
// which sections/fields to show in the MonsterPanel sidebar.
//
// All predicates are deterministic and testable without React or PixiJS.
// ============================================================================

import type { Monster, Building, WorkItem } from '@multiverse/shared'

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/** High-level error classification derived from available evidence */
export type ErrorClassification = 'incident' | 'local_failure'

/**
 * Known error signature patterns extracted from the error message.
 * Used to provide a short human-readable type label.
 */
const SIGNATURE_PATTERNS: [RegExp, string][] = [
  [/ECONNREFUSED/i, 'Connection refused'],
  [/ETIMEDOUT/i, 'Request timeout'],
  [/ENOTFOUND/i, 'DNS lookup failed'],
  [/ECONNRESET/i, 'Connection reset'],
  [/EPERM|EACCES/i, 'Permission denied'],
  [/OOM|out of memory/i, 'Out of memory'],
  [/ENOMEM/i, 'Out of memory'],
  [/5\d{2}\b/i, 'HTTP server error'],
  [/4\d{2}\b/i, 'HTTP client error'],
  [/SyntaxError/i, 'Syntax error'],
  [/TypeError/i, 'Type error'],
  [/ReferenceError/i, 'Reference error'],
  [/timeout/i, 'Timeout'],
  [/rate.?limit/i, 'Rate limited'],
  [/fetch|network/i, 'Network error'],
]

/** Extract a short error signature from the message, or null if unrecognised */
export function extractSignature(message: string | undefined): string | null {
  if (!message) return null
  for (const [pattern, label] of SIGNATURE_PATTERNS) {
    if (pattern.test(message)) return label
  }
  return null
}

/** Classify whether this error represents a real incident or a local tool failure */
export function classifyError(
  monster: Monster,
  linkedBuilding?: Building,
  linkedWorkItem?: WorkItem,
): ErrorClassification {
  // High-severity with any corroborating evidence → incident
  if (monster.severity === 'critical' || monster.severity === 'outage') {
    return 'incident'
  }

  // Linked to a work item that looks like an incident
  if (linkedWorkItem?.type === 'incident') {
    return 'incident'
  }

  // Has substantial blast radius evidence
  if (monster.affected_tiles.length >= 3) {
    return 'incident'
  }

  // Multiple signals present (building + workitem + agent fighting it)
  const signalCount =
    (linkedBuilding ? 1 : 0) +
    (linkedWorkItem ? 1 : 0) +
    (monster.fighting_agent_id ? 1 : 0) +
    (monster.affected_tiles.length > 0 ? 1 : 0)

  if (signalCount >= 3 && monster.severity !== 'warning') {
    return 'incident'
  }

  return 'local_failure'
}

// ---------------------------------------------------------------------------
// Error Codename Generator — Deterministic, severity-aware, distinct from agents
//
// Agent pools use positive/heroic names (Nova, Forge, Atlas, Greek letters).
// Error pools use ominous/mythic names to feel visually and thematically separate.
// ---------------------------------------------------------------------------

/** FNV-1a 32-bit hash — good avalanche for similar inputs */
function fnv1a(str: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/**
 * Severity-aware codename pools.
 * Each pool has prefixes[], cores[], and epithets[]. The codename is formed as
 * "Prefix Core" by picking one from each using hash(monsterId).
 * On collision, a third word (epithet) is appended instead of a number.
 *
 * These pools are intentionally disjoint from agent name pools
 * (Nova, Forge, Atlas, Alpha, Beta, etc.).
 */
const CODENAME_POOLS: Record<string, {
  prefixes: readonly string[]
  cores: readonly string[]
  epithets: readonly string[]
}> = {
  warning: {
    prefixes: ['Grey', 'Faint', 'Pale', 'Dusk', 'Mist', 'Haze', 'Thin', 'Dim',
               'Wan', 'Soft', 'Low', 'Still', 'Cold', 'Dry', 'Slow', 'Bare'],
    cores: ['Wisp', 'Moth', 'Shade', 'Flicker', 'Murmur', 'Ember', 'Glint', 'Ripple',
            'Sigh', 'Drift', 'Hush', 'Trace', 'Echo', 'Veil', 'Frost', 'Spark'],
    epithets: ['Ashen', 'Hollow', 'Silent', 'Fading', 'Distant', 'Waning', 'Fleeting', 'Sunken'],
  },
  error: {
    prefixes: ['Iron', 'Rust', 'Bitter', 'Bleak', 'Ashen', 'Thorn', 'Bane', 'Grim',
               'Dusk', 'Sable', 'Keen', 'Stark', 'Nether', 'Riven', 'Wicked', 'Fell'],
    cores: ['Fang', 'Specter', 'Wraith', 'Vortex', 'Rend', 'Scourge', 'Blight', 'Fracture',
            'Maw', 'Claw', 'Shard', 'Surge', 'Rot', 'Hex', 'Torment', 'Ruin'],
    epithets: ['Risen', 'Unbound', 'Cursed', 'Scarred', 'Twisted', 'Ragged', 'Barbed', 'Hollow'],
  },
  critical: {
    prefixes: ['Dire', 'Dread', 'Crimson', 'Void', 'Fell', 'Wrath', 'Doom', 'Black',
               'Blood', 'Shadow', 'Storm', 'Death', 'Night', 'Dark', 'Chaos', 'Bone'],
    cores: ['Hydra', 'Leviathan', 'Titan', 'Colossus', 'Behemoth', 'Reaper', 'Tyrant', 'Inferno',
            'Warden', 'Phantom', 'Sovereign', 'Herald', 'Juggernaut', 'Harbinger', 'Sentinel', 'Monolith'],
    epithets: ['Eternal', 'Ancient', 'Unchained', 'Supreme', 'Undying', 'Merciless', 'Relentless', 'Forsaken'],
  },
  outage: {
    prefixes: ['Abyssal', 'Oblivion', 'Ruin', 'Eclipse', 'Null', 'Extinction', 'Omega', 'End',
               'Nether', 'Hollow', 'Sundered', 'Shattered', 'Forsaken', 'Eldritch', 'Prime', 'Apex'],
    cores: ['Drake', 'Kraken', 'Annihilator', 'Maelstrom', 'Worldbreaker', 'Tempest', 'Ravager', 'Scourge',
            'Devourer', 'Obliterator', 'Cataclysm', 'Dominion', 'Nexus', 'Terminus', 'Sovereign', 'Abyss'],
    epithets: ['Ascended', 'Absolute', 'Infinite', 'Ultimate', 'Primordial', 'Boundless', 'Transcendent', 'Final'],
  },
}

/** Default pool used when severity is unknown */
const DEFAULT_POOL = CODENAME_POOLS['error']!

/** Session-level codename deduplication registry */
const usedCodenames = new Set<string>()

/** Reset the dedup registry (call on scenario reload) */
export function resetErrorCodenames(): void {
  usedCodenames.clear()
}

/**
 * Generate a deterministic, human-friendly codename for an error/monster.
 *
 * Uses severity-aware word pools and FNV-1a hash of the monster ID for
 * deterministic selection. On collision, appends a third word (epithet)
 * from a dedicated pool — never digits or Roman numerals.
 *
 * With 16 prefixes x 16 cores = 256 base combinations per severity,
 * plus 8 epithets for collision expansion = 2048 total unique names.
 *
 * @param monsterId - Unique monster ID (required for determinism)
 * @param severity  - Monster severity level (selects the word pool)
 * @returns A codename like "Iron Specter" or "Dire Hydra Eternal"
 */
export function generateErrorCodename(monsterId: string, severity: string): string {
  const pool = CODENAME_POOLS[severity] ?? DEFAULT_POOL
  const hash = fnv1a(monsterId)

  // Pick prefix and core using different hash bits to avoid correlation
  const prefix = pool.prefixes[hash % pool.prefixes.length]!
  const core = pool.cores[(hash >>> 16) % pool.cores.length]!
  const baseName = `${prefix} ${core}`

  // If base name is unique in this session, use it directly
  if (!usedCodenames.has(baseName)) {
    usedCodenames.add(baseName)
    return baseName
  }

  // Collision: append an epithet chosen by a different hash mix
  const epithetHash = fnv1a(monsterId + ':epithet')
  const epithet = pool.epithets[epithetHash % pool.epithets.length]!
  const expanded = `${baseName} ${epithet}`

  if (!usedCodenames.has(expanded)) {
    usedCodenames.add(expanded)
    return expanded
  }

  // Extremely rare double-collision: try remaining epithets deterministically
  for (let i = 0; i < pool.epithets.length; i++) {
    const candidate = `${baseName} ${pool.epithets[i]!}`
    if (!usedCodenames.has(candidate)) {
      usedCodenames.add(candidate)
      return candidate
    }
  }

  // Exhausted all epithets: use a unique word-based suffix from the hash
  const fallback = `${baseName} ${hashWord(monsterId)}`
  usedCodenames.add(fallback)
  return fallback
}

/** Generate a pronounceable word-like suffix from a hash (no digits) */
function hashWord(id: string): string {
  const h = fnv1a(id + ':word')
  const consonants = 'bcdfghjklmnprstvwz'
  const vowels = 'aeiou'
  // Build a 4-letter pronounceable token: CVCV
  const c1 = consonants[h % consonants.length]!
  const v1 = vowels[(h >>> 4) % vowels.length]!
  const c2 = consonants[(h >>> 8) % consonants.length]!
  const v2 = vowels[(h >>> 12) % vowels.length]!
  const word = c1 + v1 + c2 + v2
  return word.charAt(0).toUpperCase() + word.slice(1)
}

// ---------------------------------------------------------------------------
// Error Name Derivation (shared between map labels and panel titles)
// ---------------------------------------------------------------------------

/**
 * Derive error identity for both map labels and panel display.
 *
 * Returns `{ codename, descriptor, short, full }`:
 * - `codename`   — human-friendly name for map overhead (e.g. "Iron Specter")
 * - `descriptor` — technical label from error details (e.g. "Bash — Timeout")
 * - `short`      — map overhead label (== codename, always ≤20 chars)
 * - `full`       — panel title (== descriptor, technical context)
 *
 * Deterministic: same inputs always produce the same output.
 */
export function deriveErrorName(
  errorDetails: { message?: string; tool_name?: string } | undefined,
  severity: string,
  monsterId?: string,
): { codename: string; descriptor: string; short: string; full: string } {
  // --- Codename (map overhead) ---
  const codename = monsterId
    ? generateErrorCodename(monsterId, severity)
    : (CODENAME_POOLS[severity] ?? DEFAULT_POOL).cores[0]!

  // --- Descriptor (panel title / technical context) ---
  const descriptor = deriveDescriptor(errorDetails, severity, monsterId)

  return {
    codename,
    descriptor,
    short: truncLabel(codename),
    full: descriptor,
  }
}

/**
 * Derive a technical descriptor from error details.
 * Priority chain:
 *   1. tool + signature  -> "Deploy: Connection refused"
 *   2. signature only    -> "Permission denied"
 *   3. tool only         -> "Bash failure"
 *   4. message excerpt   -> first meaningful phrase from raw message
 *   5. severity fallback -> "Critical fault A3F7"
 */
function deriveDescriptor(
  errorDetails: { message?: string; tool_name?: string } | undefined,
  severity: string,
  monsterId?: string,
): string {
  const tool = errorDetails?.tool_name
  const sig = extractSignature(errorDetails?.message)

  if (tool && sig) return tool + ': ' + sig
  if (sig) return sig
  if (tool) return tool + ' failure'

  const excerpt = extractExcerpt(errorDetails?.message)
  if (excerpt) return excerpt

  const SEVERITY_LABELS: Record<string, string> = {
    warning: 'Warning',
    error: 'Fault',
    critical: 'Critical fault',
    outage: 'Outage',
  }
  const base = SEVERITY_LABELS[severity] ?? 'Fault'
  if (monsterId) {
    return `${base} ${hashSuffix(monsterId)}`
  }
  return base
}

/** Truncate a label to ≤20 chars with ellipsis */
function truncLabel(label: string): string {
  return label.length > 20 ? label.slice(0, 19) + '\u2026' : label
}

/**
 * Extract a meaningful short phrase from the raw error message.
 * Strips noise prefixes, picks the first clause, and title-cases.
 */
function extractExcerpt(message: string | undefined): string | null {
  if (!message || message.length < 3) return null

  let cleaned = message
    .replace(/^(Error|ERROR|error):\s*/i, '')
    .replace(/^(Uncaught|Unhandled)\s*/i, '')
    .replace(/^(Exception|exception):\s*/i, '')
    .trim()

  if (cleaned.length < 3) return null

  const clauseEnd = cleaned.search(/[.:\n]/)
  if (clauseEnd > 0 && clauseEnd < 50) {
    cleaned = cleaned.slice(0, clauseEnd).trim()
  }

  if (cleaned.length > 40) {
    cleaned = cleaned.slice(0, 39) + '\u2026'
  }

  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

/** Deterministic short hash suffix from an ID (e.g. "K7X2") */
function hashSuffix(id: string): string {
  return fnv1a(id).toString(36).slice(0, 4).toUpperCase()
}

// ---------------------------------------------------------------------------
// Panel Title (technical descriptor for click-through panel)
// ---------------------------------------------------------------------------

/**
 * Generate a context-aware title for the panel header.
 * Shows the technical descriptor (not the codename) so the user gets
 * actionable information when they click on a monster.
 */
export function panelTitle(
  monster: Monster,
  classification: ErrorClassification,
): string {
  if (classification === 'incident') {
    return 'Incident'
  }
  return deriveErrorName(monster.error_details, monster.severity, monster.id).descriptor
}

// ---------------------------------------------------------------------------
// Friendly error message
// ---------------------------------------------------------------------------

/**
 * Produce a user-friendly one-liner from the raw error message.
 * Falls back to the raw message if no pattern matches.
 */
const FRIENDLY_PATTERNS: [RegExp, string][] = [
  [/Request failed with status code (\d+)/i, 'HTTP request failed ($1)'],
  [/ECONNREFUSED/i, 'Could not connect to remote service'],
  [/ETIMEDOUT/i, 'Request timed out waiting for a response'],
  [/ENOTFOUND/i, 'Could not resolve host address'],
  [/ECONNRESET/i, 'Connection was unexpectedly closed'],
  [/rate.?limit/i, 'Rate limit exceeded — too many requests'],
  [/File has not been read yet/i, 'Attempted to write a file before reading it'],
  [/user doesn.t want to proceed/i, 'Tool use was rejected by the user'],
]

export function friendlyMessage(rawMessage: string | undefined): { friendly: string; technical: string | null } {
  const raw = rawMessage ?? 'Unknown error'
  for (const [pattern, template] of FRIENDLY_PATTERNS) {
    const match = raw.match(pattern)
    if (match) {
      let friendly = template
      // Replace $1, $2 etc with capture groups
      for (let i = 1; i < match.length; i++) {
        friendly = friendly.replace(`$${i}`, match[i]!)
      }
      // Only show technical line if it's different enough
      const technical = raw.length > friendly.length + 10 ? raw : null
      return { friendly, technical }
    }
  }
  return { friendly: raw, technical: null }
}

// ---------------------------------------------------------------------------
// Significance label
// ---------------------------------------------------------------------------

const SIGNIFICANCE_MAP: Record<string, string> = {
  outage: 'Sev-1 (service outage)',
  critical: 'Sev-2 (service degradation)',
  error: 'Sev-3 (component failure)',
  warning: 'Sev-4 (transient issue)',
}

export function significanceLabel(severity: string): string {
  return SIGNIFICANCE_MAP[severity] ?? 'Unknown'
}

// ---------------------------------------------------------------------------
// Scope / impact label
// ---------------------------------------------------------------------------

export function scopeLabel(
  classification: ErrorClassification,
  monster: Monster,
  linkedBuilding?: Building,
): string {
  if (classification === 'incident') {
    if (monster.severity === 'outage') return 'Service-wide impact'
    if (linkedBuilding) return `Degraded: ${linkedBuilding.name}`
    return 'User-facing impact'
  }
  return 'Local task failure (no user impact)'
}

// ---------------------------------------------------------------------------
// Status labels
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  spawned: 'Active',
  in_combat: 'Being resolved',
  dormant: 'Dormant',
  defeated: 'Resolved',
  escalated: 'Escalated',
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status
}

const STATUS_COLORS: Record<string, string> = {
  spawned: 'text-red-400',
  in_combat: 'text-yellow-400',
  dormant: 'text-muted-foreground',
  defeated: 'text-green-400',
  escalated: 'text-red-500',
}

export function statusColor(status: string): string {
  return STATUS_COLORS[status] ?? 'text-muted-foreground'
}

// ---------------------------------------------------------------------------
// ETA
// ---------------------------------------------------------------------------

export function estimatedResolution(severity: string): string {
  switch (severity) {
    case 'warning': return '< 5 mins'
    case 'error': return '5–15 mins'
    case 'critical': return '15–60 mins'
    case 'outage': return '1+ hours'
    default: return '< 5 mins'
  }
}

// ---------------------------------------------------------------------------
// Duration formatting
// ---------------------------------------------------------------------------

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000 // 24 hours

/** Whether a duration should be displayed as "stale" */
export function isStale(ms: number): boolean {
  return ms >= STALE_THRESHOLD_MS
}

export function formatDuration(ms: number): string {
  if (ms < 0) return '0s'
  const totalSeconds = Math.floor(ms / 1000)
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes < 60) return `${minutes}m ${seconds.toString().padStart(2, '0')}s`
  const hours = Math.floor(minutes / 60)
  const remMinutes = minutes % 60
  if (hours < 24) return `${hours}h ${remMinutes.toString().padStart(2, '0')}m`
  const days = Math.floor(hours / 24)
  const remHours = hours % 24
  return `${days}d ${remHours}h`
}

/** Format a timestamp as a readable time string */
export function formatTimestamp(ts: number): string {
  const date = new Date(ts)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ---------------------------------------------------------------------------
// Section visibility predicates
// ---------------------------------------------------------------------------

export interface PanelVisibility {
  /** Always shown: severity, status, message */

  /** Show tool name row */
  showTool: boolean
  /** Show error signature chip */
  showSignature: boolean

  /** Show "Impact" section (significance, scope, affected work, tiles) */
  showImpact: boolean
  /** Show affected building link */
  showAffectedBuilding: boolean
  /** Show affected work item */
  showAffectedWorkItem: boolean
  /** Show affected tiles count */
  showAffectedTiles: boolean

  /** Show "Timeline" section (only for incidents or resolved errors) */
  showTimeline: boolean
  /** Show resolved_at row */
  showResolvedAt: boolean
  /** Show open duration ticker */
  showOpenDuration: boolean

  /** Show assigned agent link */
  showAgent: boolean
  /** Show health bar — only for incidents or in_combat, not simple local failures */
  showHealth: boolean

  /** Show "Debug" collapsible (stack trace / logs) */
  showDebug: boolean
  showStackTrace: boolean
  showLogs: boolean
}

export function computeVisibility(
  monster: Monster,
  classification: ErrorClassification,
  linkedBuilding?: Building,
  linkedWorkItem?: WorkItem,
): PanelVisibility {
  const hasStack = Boolean(monster.error_details?.stack_trace)
  const hasLogs = Boolean(monster.error_details?.logs && monster.error_details.logs.length > 0)
  const isResolved = monster.status === 'defeated'
  const isIncident = classification === 'incident'
  const isInCombat = monster.status === 'in_combat'

  return {
    showTool: Boolean(monster.error_details?.tool_name),
    showSignature: Boolean(extractSignature(monster.error_details?.message)),

    showImpact: isIncident ||
      Boolean(linkedBuilding) ||
      Boolean(linkedWorkItem) ||
      monster.affected_tiles.length > 0,
    showAffectedBuilding: Boolean(linkedBuilding),
    showAffectedWorkItem: Boolean(linkedWorkItem),
    showAffectedTiles: monster.affected_tiles.length > 0,

    showTimeline: isIncident || isResolved,
    showResolvedAt: Boolean(monster.resolved_at),
    showOpenDuration: !isResolved,

    showAgent: Boolean(monster.fighting_agent_id),
    // Show health only for incidents or when actively being fought — not for
    // simple local failures where the health bar is meaningless noise
    showHealth: monster.health < 100 && (isIncident || isInCombat),

    showDebug: hasStack || hasLogs,
    showStackTrace: hasStack,
    showLogs: hasLogs,
  }
}

// ---------------------------------------------------------------------------
// Output usefulness predicate
// ---------------------------------------------------------------------------

/** Normalize a string for comparison (lowercase, collapse whitespace, trim) */
function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Determine whether the raw output message is meaningfully different from
 * the other known labels (tool name, codename, descriptor). If it matches
 * any of these, showing it would be redundant.
 */
export function isOutputUseful(
  rawMessage: string | undefined,
  compareTo: { toolName?: string; codename?: string; descriptor?: string },
): boolean {
  if (!rawMessage || rawMessage.trim().length === 0) return false
  const norm = normalize(rawMessage)

  // Suppress if it matches any known label
  const checks = [compareTo.toolName, compareTo.codename, compareTo.descriptor]
  for (const label of checks) {
    if (label && normalize(label) === norm) return false
  }

  // Suppress generic placeholders
  const GENERIC = ['error', 'error detected', 'unknown error', 'failed', 'failure']
  if (GENERIC.includes(norm)) return false

  return true
}
