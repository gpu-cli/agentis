// ============================================================================
// Tests for monster-panel-vm — classification, visibility, helpers
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest'
import type { Monster, Building, WorkItem } from '@multiverse/shared'
import {
  classifyError,
  computeVisibility,
  extractSignature,
  deriveErrorName,
  generateErrorCodename,
  resetErrorCodenames,
  significanceLabel,
  scopeLabel,
  statusLabel,
  statusColor,
  estimatedResolution,
  formatDuration,
  formatTimestamp,
  panelTitle,
  friendlyMessage,
  isStale,
  isOutputUseful,
} from '../components/monster-panel-vm'

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeMonster(overrides: Partial<Monster> = {}): Monster {
  return {
    id: 'monster_1',
    planet_id: 'planet_1',
    severity: 'error',
    monster_type: 'slime',
    position: { chunk_x: 0, chunk_y: 0, local_x: 5, local_y: 5 },
    affected_tiles: [],
    status: 'spawned',
    health: 100,
    error_details: {
      message: 'Tool failed',
    },
    conversation_thread: [],
    spawned_at: Date.now() - 60_000,
    ...overrides,
  }
}

function makeBuilding(overrides: Partial<Building> = {}): Building {
  return {
    id: 'bld_1',
    planet_id: 'planet_1',
    island_id: 'island_1',
    district_id: 'district_1',
    name: 'service-api',
    style: 'house',
    footprint: { w: 2, h: 2 },
    position: { chunk_x: 0, chunk_y: 0, local_x: 3, local_y: 3 },
    tiles: [],
    health: 100,
    material_state: 'solid',
    ...overrides,
  } as Building
}

function makeWorkItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 'wi_1',
    planet_id: 'planet_1',
    type: 'ticket',
    title: 'Fix deploy pipeline',
    status: 'active',
    links: [],
    created_at: Date.now(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// extractSignature
// ---------------------------------------------------------------------------

describe('extractSignature', () => {
  it('extracts ECONNREFUSED', () => {
    expect(extractSignature('ECONNREFUSED on api.internal:3000')).toBe('Connection refused')
  })

  it('extracts ETIMEDOUT', () => {
    expect(extractSignature('Request timed out after 30s: ETIMEDOUT')).toBe('Request timeout')
  })

  it('extracts HTTP 5xx', () => {
    expect(extractSignature('HTTP 502 Bad Gateway')).toBe('HTTP server error')
  })

  it('extracts HTTP 4xx', () => {
    expect(extractSignature('HTTP 404 Not Found')).toBe('HTTP client error')
  })

  it('extracts timeout (generic)', () => {
    expect(extractSignature('Request timeout after 30s')).toBe('Timeout')
  })

  it('extracts network/fetch errors', () => {
    expect(extractSignature('WebFetch')).toBe('Network error')
  })

  it('extracts rate limiting', () => {
    expect(extractSignature('Rate limit exceeded')).toBe('Rate limited')
  })

  it('returns null for unknown messages', () => {
    expect(extractSignature('Something happened')).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(extractSignature(undefined)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// classifyError
// ---------------------------------------------------------------------------

describe('classifyError', () => {
  it('classifies warning with no evidence as local_failure', () => {
    const monster = makeMonster({ severity: 'warning' })
    expect(classifyError(monster)).toBe('local_failure')
  })

  it('classifies error with no evidence as local_failure', () => {
    const monster = makeMonster({ severity: 'error' })
    expect(classifyError(monster)).toBe('local_failure')
  })

  it('classifies critical as incident', () => {
    const monster = makeMonster({ severity: 'critical' })
    expect(classifyError(monster)).toBe('incident')
  })

  it('classifies outage as incident', () => {
    const monster = makeMonster({ severity: 'outage' })
    expect(classifyError(monster)).toBe('incident')
  })

  it('classifies error linked to incident work item as incident', () => {
    const monster = makeMonster({ severity: 'error' })
    const workItem = makeWorkItem({ type: 'incident' })
    expect(classifyError(monster, undefined, workItem)).toBe('incident')
  })

  it('classifies error with many affected tiles as incident', () => {
    const monster = makeMonster({
      severity: 'error',
      affected_tiles: ['t1', 't2', 't3'],
    })
    expect(classifyError(monster)).toBe('incident')
  })

  it('classifies error with multiple signals as incident', () => {
    const monster = makeMonster({
      severity: 'error',
      affected_tiles: ['t1'],
      fighting_agent_id: 'agent_1',
    })
    const building = makeBuilding()
    const workItem = makeWorkItem()
    expect(classifyError(monster, building, workItem)).toBe('incident')
  })

  it('classifies warning with multiple signals as local_failure (warning protected)', () => {
    const monster = makeMonster({
      severity: 'warning',
      affected_tiles: ['t1'],
      fighting_agent_id: 'agent_1',
    })
    const building = makeBuilding()
    const workItem = makeWorkItem()
    // 4 signals but severity=warning protects it
    expect(classifyError(monster, building, workItem)).toBe('local_failure')
  })

  it('classifies simple webfetch failure as local_failure', () => {
    const monster = makeMonster({
      severity: 'warning',
      error_details: { message: 'WebFetch', tool_name: 'WebFetch' },
    })
    expect(classifyError(monster)).toBe('local_failure')
  })
})

// ---------------------------------------------------------------------------
// computeVisibility
// ---------------------------------------------------------------------------

describe('computeVisibility', () => {
  it('hides impact section for simple local failure', () => {
    const monster = makeMonster({ severity: 'warning' })
    const vis = computeVisibility(monster, 'local_failure')
    expect(vis.showImpact).toBe(false)
    expect(vis.showTimeline).toBe(false)
  })

  it('shows impact section for incident', () => {
    const monster = makeMonster({ severity: 'critical' })
    const vis = computeVisibility(monster, 'incident')
    expect(vis.showImpact).toBe(true)
  })

  it('shows impact when building is linked (even local_failure)', () => {
    const monster = makeMonster({ severity: 'error', affected_building_id: 'bld_1' })
    const building = makeBuilding()
    const vis = computeVisibility(monster, 'local_failure', building)
    expect(vis.showImpact).toBe(true)
    expect(vis.showAffectedBuilding).toBe(true)
  })

  it('hides tool when not present', () => {
    const monster = makeMonster({ error_details: { message: 'fail' } })
    const vis = computeVisibility(monster, 'local_failure')
    expect(vis.showTool).toBe(false)
  })

  it('shows tool when present', () => {
    const monster = makeMonster({
      error_details: { message: 'fail', tool_name: 'Bash' },
    })
    const vis = computeVisibility(monster, 'local_failure')
    expect(vis.showTool).toBe(true)
  })

  it('shows signature for known error patterns', () => {
    const monster = makeMonster({
      error_details: { message: 'ECONNREFUSED on port 3000' },
    })
    const vis = computeVisibility(monster, 'local_failure')
    expect(vis.showSignature).toBe(true)
  })

  it('hides signature for unknown patterns', () => {
    const monster = makeMonster({
      error_details: { message: 'Something broke' },
    })
    const vis = computeVisibility(monster, 'local_failure')
    expect(vis.showSignature).toBe(false)
  })

  it('shows timeline for incidents', () => {
    const monster = makeMonster({ severity: 'critical' })
    const vis = computeVisibility(monster, 'incident')
    expect(vis.showTimeline).toBe(true)
  })

  it('shows timeline for resolved errors', () => {
    const monster = makeMonster({ status: 'defeated', resolved_at: Date.now() })
    const vis = computeVisibility(monster, 'local_failure')
    expect(vis.showTimeline).toBe(true)
    expect(vis.showResolvedAt).toBe(true)
    expect(vis.showOpenDuration).toBe(false)
  })

  it('hides debug when no stack or logs', () => {
    const monster = makeMonster({ error_details: { message: 'fail' } })
    const vis = computeVisibility(monster, 'local_failure')
    expect(vis.showDebug).toBe(false)
  })

  it('shows debug when stack trace exists', () => {
    const monster = makeMonster({
      error_details: { message: 'fail', stack_trace: 'at foo.ts:1' },
    })
    const vis = computeVisibility(monster, 'local_failure')
    expect(vis.showDebug).toBe(true)
    expect(vis.showStackTrace).toBe(true)
  })

  it('shows debug when logs exist', () => {
    const monster = makeMonster({
      error_details: { message: 'fail', logs: ['line 1'] },
    })
    const vis = computeVisibility(monster, 'local_failure')
    expect(vis.showDebug).toBe(true)
    expect(vis.showLogs).toBe(true)
  })

  it('hides health at 100%', () => {
    const monster = makeMonster({ health: 100 })
    const vis = computeVisibility(monster, 'local_failure')
    expect(vis.showHealth).toBe(false)
  })

  it('hides health for local_failure even when damaged', () => {
    const monster = makeMonster({ health: 75 })
    const vis = computeVisibility(monster, 'local_failure')
    expect(vis.showHealth).toBe(false)
  })

  it('shows health for incident when damaged', () => {
    const monster = makeMonster({ health: 75, severity: 'critical' })
    const vis = computeVisibility(monster, 'incident')
    expect(vis.showHealth).toBe(true)
  })

  it('shows health for in_combat when damaged', () => {
    const monster = makeMonster({ health: 50, status: 'in_combat' })
    const vis = computeVisibility(monster, 'local_failure')
    expect(vis.showHealth).toBe(true)
  })

  it('shows agent when fighting', () => {
    const monster = makeMonster({ fighting_agent_id: 'agent_1' })
    const vis = computeVisibility(monster, 'local_failure')
    expect(vis.showAgent).toBe(true)
  })

  it('hides agent when not fighting', () => {
    const monster = makeMonster()
    const vis = computeVisibility(monster, 'local_failure')
    expect(vis.showAgent).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Label helpers
// ---------------------------------------------------------------------------

describe('label helpers', () => {
  it('significanceLabel maps severities', () => {
    expect(significanceLabel('outage')).toContain('Sev-1')
    expect(significanceLabel('critical')).toContain('Sev-2')
    expect(significanceLabel('error')).toContain('Sev-3')
    expect(significanceLabel('warning')).toContain('Sev-4')
    expect(significanceLabel('unknown')).toBe('Unknown')
  })

  it('scopeLabel for local failure', () => {
    const monster = makeMonster({ severity: 'warning' })
    expect(scopeLabel('local_failure', monster)).toContain('no user impact')
  })

  it('scopeLabel for incident with building', () => {
    const monster = makeMonster({ severity: 'critical' })
    const building = makeBuilding({ name: 'api-server' })
    const label = scopeLabel('incident', monster, building)
    expect(label).toContain('api-server')
  })

  it('scopeLabel for outage', () => {
    const monster = makeMonster({ severity: 'outage' })
    expect(scopeLabel('incident', monster)).toContain('Service-wide')
  })

  it('statusLabel maps statuses', () => {
    expect(statusLabel('spawned')).toBe('Active')
    expect(statusLabel('in_combat')).toBe('Being resolved')
    expect(statusLabel('defeated')).toBe('Resolved')
  })

  it('statusColor returns valid CSS class', () => {
    expect(statusColor('spawned')).toContain('text-')
    expect(statusColor('defeated')).toContain('text-green')
  })

  it('estimatedResolution maps severities', () => {
    expect(estimatedResolution('warning')).toBe('< 5 mins')
    expect(estimatedResolution('error')).toBe('5–15 mins')
    expect(estimatedResolution('critical')).toBe('15–60 mins')
    expect(estimatedResolution('outage')).toBe('1+ hours')
    expect(estimatedResolution('unknown')).toBe('< 5 mins')
  })
})

// ---------------------------------------------------------------------------
// formatDuration
// ---------------------------------------------------------------------------

describe('formatDuration', () => {
  it('formats seconds', () => {
    expect(formatDuration(45_000)).toBe('45s')
  })

  it('formats minutes and seconds', () => {
    expect(formatDuration(125_000)).toBe('2m 05s')
  })

  it('formats hours and minutes', () => {
    expect(formatDuration(3_725_000)).toBe('1h 02m')
  })

  it('formats days and hours for long durations', () => {
    expect(formatDuration(26 * 60 * 60 * 1000)).toBe('1d 2h')
  })

  it('handles zero', () => {
    expect(formatDuration(0)).toBe('0s')
  })

  it('handles negative (clamps)', () => {
    expect(formatDuration(-1000)).toBe('0s')
  })
})

// ---------------------------------------------------------------------------
// formatTimestamp
// ---------------------------------------------------------------------------

describe('formatTimestamp', () => {
  it('returns a string with colons (time format)', () => {
    const result = formatTimestamp(Date.now())
    expect(result).toMatch(/\d{1,2}:\d{2}:\d{2}/)
  })
})

// ---------------------------------------------------------------------------
// panelTitle
// ---------------------------------------------------------------------------

describe('panelTitle', () => {
  it('returns "Incident" for incident classification', () => {
    const monster = makeMonster({ severity: 'critical' })
    expect(panelTitle(monster, 'incident')).toBe('Incident')
  })

  it('returns technical descriptor with tool + signature', () => {
    const monster = makeMonster({
      error_details: { message: 'ECONNREFUSED on port 3000', tool_name: 'Deploy' },
    })
    expect(panelTitle(monster, 'local_failure')).toBe('Deploy: Connection refused')
  })

  it('returns "Tool failure" when only tool present', () => {
    const monster = makeMonster({
      error_details: { message: 'Something broke', tool_name: 'Bash' },
    })
    expect(panelTitle(monster, 'local_failure')).toBe('Bash failure')
  })

  it('returns signature when only signature present', () => {
    const monster = makeMonster({
      error_details: { message: 'Request timed out: ETIMEDOUT' },
    })
    expect(panelTitle(monster, 'local_failure')).toBe('Request timeout')
  })

  it('derives excerpt from message when no tool or signature', () => {
    const monster = makeMonster({
      error_details: { message: 'Something happened' },
    })
    expect(panelTitle(monster, 'local_failure')).toBe('Something happened')
  })

  it('returns severity + hash suffix when message is too short', () => {
    const monster = makeMonster({
      error_details: { message: 'ab' },
    })
    const title = panelTitle(monster, 'local_failure')
    expect(title).toMatch(/^Fault /)
  })
})

// ---------------------------------------------------------------------------
// generateErrorCodename
// ---------------------------------------------------------------------------

describe('generateErrorCodename', () => {
  beforeEach(() => resetErrorCodenames())

  it('generates a two-word codename', () => {
    const name = generateErrorCodename('monster_001', 'error')
    const words = name.split(' ')
    expect(words.length).toBe(2)
    expect(words[0]!.length).toBeGreaterThan(0)
    expect(words[1]!.length).toBeGreaterThan(0)
  })

  it('is deterministic for same ID and severity', () => {
    const a = generateErrorCodename('monster_abc', 'error')
    resetErrorCodenames()
    const b = generateErrorCodename('monster_abc', 'error')
    expect(a).toBe(b)
  })

  it('uses different pools per severity', () => {
    const warning = generateErrorCodename('same_id', 'warning')
    resetErrorCodenames()
    const critical = generateErrorCodename('same_id', 'critical')
    expect(warning).not.toBe(critical)
  })

  it('handles collisions with word-based expansion (no digits)', () => {
    const names: string[] = []
    for (let i = 0; i < 100; i++) {
      names.push(generateErrorCodename(`monster_collision_${i}`, 'error'))
    }
    // All names should be unique (collisions get expanded with epithets)
    const unique = new Set(names)
    expect(unique.size).toBe(names.length)
    // No name should contain any digit
    for (const name of names) {
      expect(name).not.toMatch(/\d/)
    }
  })

  it('codenames do not overlap with agent name pools', () => {
    const agentNames = new Set([
      'Nova', 'Forge', 'Iris', 'Atlas', 'Echo', 'Pulse', 'Drift', 'Spark',
      'Flux', 'Onyx', 'Sage', 'Blaze', 'Glitch', 'Cipher', 'Volt', 'Helix',
      'Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta',
    ])
    // Generate a batch of codenames and check no word matches agent names
    for (let i = 0; i < 50; i++) {
      const name = generateErrorCodename(`monster_pool_test_${i}`, 'error')
      const words = name.split(' ')
      for (const word of words) {
        expect(agentNames.has(word)).toBe(false)
      }
    }
  })

  it('resets dedup registry on resetErrorCodenames()', () => {
    const first = generateErrorCodename('monster_x', 'warning')
    resetErrorCodenames()
    const second = generateErrorCodename('monster_x', 'warning')
    expect(first).toBe(second) // Same ID after reset should get same base name
  })
})

// ---------------------------------------------------------------------------
// deriveErrorName
// ---------------------------------------------------------------------------

describe('deriveErrorName', () => {
  beforeEach(() => resetErrorCodenames())

  it('returns codename as short and descriptor as full', () => {
    const result = deriveErrorName({ message: 'ECONNREFUSED', tool_name: 'Deploy' }, 'error', 'monster_test_1')
    // short should be a codename (two words from error pool)
    expect(result.short.split(' ').length).toBeGreaterThanOrEqual(2)
    expect(result.codename).toBe(result.short)
    // full should be the technical descriptor
    expect(result.full).toBe('Deploy: Connection refused')
    expect(result.descriptor).toBe(result.full)
  })

  it('returns signature-only descriptor when no tool', () => {
    const result = deriveErrorName({ message: 'TypeError: x is not a function' }, 'error', 'monster_test_2')
    expect(result.descriptor).toBe('Type error')
  })

  it('returns tool failure descriptor when no signature', () => {
    const result = deriveErrorName({ message: 'Something went wrong', tool_name: 'Bash' }, 'error', 'monster_test_3')
    expect(result.descriptor).toBe('Bash failure')
  })

  it('extracts excerpt from raw message when no tool/signature', () => {
    const result = deriveErrorName({ message: 'Module not found: cannot resolve ./missing' }, 'error', 'monster_test_4')
    expect(result.descriptor).toBe('Module not found')
  })

  it('falls back to severity + hash descriptor when message is too short', () => {
    const result = deriveErrorName({ message: 'ok' }, 'critical', 'monster_abc123')
    expect(result.descriptor).toMatch(/^Critical fault [A-Z0-9]+$/)
  })

  it('short label (codename) is always <=20 chars', () => {
    for (let i = 0; i < 30; i++) {
      const result = deriveErrorName({ message: 'x' }, 'outage', `monster_len_${i}`)
      expect(result.short.length).toBeLessThanOrEqual(20)
    }
  })

  it('is deterministic for same inputs', () => {
    const a = deriveErrorName({ message: 'x' }, 'error', 'monster_xyz')
    resetErrorCodenames()
    const b = deriveErrorName({ message: 'x' }, 'error', 'monster_xyz')
    expect(a).toEqual(b)
  })

  it('different monster IDs produce different codenames', () => {
    const a = deriveErrorName({ message: '' }, 'error', 'monster_alpha_session_001')
    const b = deriveErrorName({ message: '' }, 'error', 'monster_beta_session_042')
    expect(a.codename).not.toBe(b.codename)
  })
})

// ---------------------------------------------------------------------------
// friendlyMessage
// ---------------------------------------------------------------------------

describe('friendlyMessage', () => {
  it('humanizes HTTP status code errors', () => {
    const result = friendlyMessage('Request failed with status code 403')
    expect(result.friendly).toBe('HTTP request failed (403)')
  })

  it('humanizes ECONNREFUSED', () => {
    const result = friendlyMessage('ECONNREFUSED on api.internal:3000')
    expect(result.friendly).toBe('Could not connect to remote service')
    // Technical line is only shown when raw is significantly longer
  })

  it('humanizes tool rejection', () => {
    const result = friendlyMessage("The user doesn't want to proceed with this tool use.")
    expect(result.friendly).toBe('Tool use was rejected by the user')
  })

  it('passes through unknown messages as-is', () => {
    const result = friendlyMessage('Something obscure happened')
    expect(result.friendly).toBe('Something obscure happened')
    expect(result.technical).toBeNull()
  })

  it('handles undefined', () => {
    const result = friendlyMessage(undefined)
    expect(result.friendly).toBe('Unknown error')
  })
})

// ---------------------------------------------------------------------------
// isStale
// ---------------------------------------------------------------------------

describe('isStale', () => {
  it('returns false for durations under 24h', () => {
    expect(isStale(23 * 60 * 60 * 1000)).toBe(false)
  })

  it('returns true for durations at 24h', () => {
    expect(isStale(24 * 60 * 60 * 1000)).toBe(true)
  })

  it('returns true for durations over 24h', () => {
    expect(isStale(150 * 60 * 60 * 1000)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// isOutputUseful
// ---------------------------------------------------------------------------

describe('isOutputUseful', () => {
  it('returns false for empty/undefined message', () => {
    expect(isOutputUseful(undefined, {})).toBe(false)
    expect(isOutputUseful('', {})).toBe(false)
    expect(isOutputUseful('   ', {})).toBe(false)
  })

  it('returns false when message matches tool name', () => {
    expect(isOutputUseful('WebFetch', { toolName: 'WebFetch' })).toBe(false)
    expect(isOutputUseful('webfetch', { toolName: 'WebFetch' })).toBe(false)
  })

  it('returns false when message matches codename', () => {
    expect(isOutputUseful('Iron Specter', { codename: 'Iron Specter' })).toBe(false)
  })

  it('returns false when message matches descriptor', () => {
    expect(isOutputUseful('WebFetch Network error', { descriptor: 'WebFetch Network error' })).toBe(false)
  })

  it('returns false for generic placeholders', () => {
    expect(isOutputUseful('Error', {})).toBe(false)
    expect(isOutputUseful('error detected', {})).toBe(false)
    expect(isOutputUseful('Unknown error', {})).toBe(false)
    expect(isOutputUseful('failed', {})).toBe(false)
  })

  it('returns true for meaningful output that differs', () => {
    expect(isOutputUseful('Request failed with status code 403', { toolName: 'WebFetch' })).toBe(true)
    expect(isOutputUseful('ECONNREFUSED on api.internal:3000', { toolName: 'Deploy', codename: 'Iron Specter' })).toBe(true)
  })

  it('returns true for detailed error messages', () => {
    expect(isOutputUseful('Module not found: cannot resolve ./missing', { toolName: 'Bash' })).toBe(true)
  })
})
