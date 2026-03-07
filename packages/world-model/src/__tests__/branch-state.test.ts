// ============================================================================
// World Model — BranchTracker + Delete/Move/Rename Semantics (hq-gij.2.2)
// ============================================================================

import { describe, it, expect } from 'vitest'
import { BranchTracker } from '../branch-state'
import type { CanonicalOperation, ActorRef, WorkUnit } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACTOR: ActorRef = { id: 'actor_main', kind: 'agent', parentId: null, name: 'Claude' }

function makeOp(overrides: Partial<CanonicalOperation> = {}): CanonicalOperation {
  return {
    id: 'op_test',
    timestamp: Date.now(),
    actor: ACTOR,
    kind: 'file_write',
    targetPath: '/project/src/main.ts',
    repoRoot: '/project',
    branch: 'main',
    toolName: 'Write',
    summary: 'Write main.ts',
    rawRef: { file: 'session.jsonl', line: 1 },
    ...overrides,
  }
}

function makeWorkUnit(overrides: Partial<WorkUnit> = {}): WorkUnit {
  return {
    id: 'wu_test',
    paths: ['src/main.ts'],
    repoRoot: '/project',
    districtId: 'dist_1',
    mass: 5,
    branch: 'main',
    materialState: 'solid',
    mergeEvidence: null,
    stats: { opCount: 1, editCount: 1, readCount: 0, commandCount: 0, lastTouched: 0, actors: ['a'], errorCount: 0 },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// BranchTracker.isMainBranch
// ---------------------------------------------------------------------------

describe('BranchTracker.isMainBranch', () => {
  const tracker = new BranchTracker()

  it('recognizes main/master/trunk', () => {
    expect(tracker.isMainBranch('main')).toBe(true)
    expect(tracker.isMainBranch('master')).toBe(true)
    expect(tracker.isMainBranch('trunk')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(tracker.isMainBranch('Main')).toBe(true)
    expect(tracker.isMainBranch('MASTER')).toBe(true)
  })

  it('recognizes main/ prefixed branches', () => {
    expect(tracker.isMainBranch('main/release')).toBe(true)
    expect(tracker.isMainBranch('master/hotfix')).toBe(true)
  })

  it('rejects feature branches', () => {
    expect(tracker.isMainBranch('feature/login')).toBe(false)
    expect(tracker.isMainBranch('fix/bug-123')).toBe(false)
  })

  it('treats null as main (benefit of doubt)', () => {
    expect(tracker.isMainBranch(null)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// BranchTracker.trackOperation — material state
// ---------------------------------------------------------------------------

describe('BranchTracker.trackOperation', () => {
  it('returns solid for main branch operations', () => {
    const tracker = new BranchTracker()
    const state = tracker.trackOperation(makeOp({ branch: 'main' }))
    expect(state).toBe('solid')
  })

  it('returns ghost for non-main branch without merge evidence', () => {
    const tracker = new BranchTracker()
    const state = tracker.trackOperation(makeOp({ branch: 'feature/login' }))
    expect(state).toBe('ghost')
  })

  it('returns solid for null branch (benefit of doubt)', () => {
    const tracker = new BranchTracker()
    const state = tracker.trackOperation(makeOp({ branch: null }))
    expect(state).toBe('solid')
  })

  it('remembers last branch per actor', () => {
    const tracker = new BranchTracker()

    // Set branch to feature
    tracker.trackOperation(makeOp({ branch: 'feature/x', actor: ACTOR }))

    // Next op has no branch — should use remembered branch
    const state = tracker.trackOperation(makeOp({ branch: null, actor: ACTOR }))
    // No merge evidence for feature/x, so should be ghost? Actually the code returns
    // 'solid' for null branch via the fallback. Let's trace: branch = null ?? currentBranch.get(actorId) ?? null
    // → 'feature/x' (remembered). Then: not main → check merges → no → 'ghost'
    // Wait, the branch param is null, so it falls through to the remembered branch.
    // Actually looking at the code more carefully: op.branch is null, so currentBranch isn't updated.
    // Then branch = null ?? remembered → 'feature/x'. Not main, no merge → ghost.
    expect(state).toBe('ghost')
  })
})

// ---------------------------------------------------------------------------
// BranchTracker.detectMerges
// ---------------------------------------------------------------------------

describe('BranchTracker.detectMerges', () => {
  it('detects explicit git merge commands', () => {
    const tracker = new BranchTracker()
    // The extractMergeBranch regex needs a space after the branch name:
    // /merge\s+(?:branch\s+)?['"]?(\S+?)['"]?\s/
    // So add trailing content after branch name to provide the trailing \s match
    const ops = [
      makeOp({
        kind: 'merge',
        summary: 'git merge feature-login into main',
        branch: 'main',
        timestamp: 1000,
      }),
    ]

    const merges = tracker.detectMerges(ops)
    expect(merges.has('feature-login')).toBe(true)
    expect(merges.get('feature-login')!.kind).toBe('explicit_merge')
    expect(merges.get('feature-login')!.confidence).toBe('high')
  })

  it('detects gh pr merge commands', () => {
    const tracker = new BranchTracker()
    const ops = [
      makeOp({
        kind: 'command_run',
        summary: 'Bash gh pr merge --squash head:feature-fix',
        branch: 'main',
        timestamp: 1000,
      }),
    ]

    const merges = tracker.detectMerges(ops)
    expect(merges.has('feature-fix')).toBe(true)
    expect(merges.get('feature-fix')!.kind).toBe('pr_merge_command')
  })

  it('detects branch switch + file touch as medium-confidence merge', () => {
    const tracker = new BranchTracker()
    const ops = [
      // Actor working on feature branch
      makeOp({ kind: 'file_write', branch: 'feature/x', timestamp: 1000, actor: ACTOR }),
      // Switch to main
      makeOp({ kind: 'branch_switch', branch: 'main', timestamp: 2000, actor: ACTOR }),
      // Touch file within 60s of switch
      makeOp({ kind: 'file_write', branch: 'main', targetPath: '/project/src/main.ts', timestamp: 2500, actor: ACTOR }),
    ]

    const merges = tracker.detectMerges(ops)
    expect(merges.has('feature/x')).toBe(true)
    expect(merges.get('feature/x')!.confidence).toBe('medium')
  })
})

// ---------------------------------------------------------------------------
// BranchTracker.applyToWorkUnits
// ---------------------------------------------------------------------------

describe('BranchTracker.applyToWorkUnits', () => {
  it('solidifies work units on main branch', () => {
    const tracker = new BranchTracker()
    const units = [makeWorkUnit({ branch: 'main', materialState: 'ghost' })]

    tracker.applyToWorkUnits(units)
    expect(units[0]!.materialState).toBe('solid')
  })

  it('solidifies work units with null branch', () => {
    const tracker = new BranchTracker()
    const units = [makeWorkUnit({ branch: null, materialState: 'ghost' })]

    tracker.applyToWorkUnits(units)
    expect(units[0]!.materialState).toBe('solid')
  })

  it('solidifies feature-branch units with merge evidence', () => {
    const tracker = new BranchTracker()
    const ops = [makeOp({ kind: 'merge', summary: 'git merge feature/x into main', timestamp: 1000 })]
    tracker.detectMerges(ops)

    const units = [makeWorkUnit({ branch: 'feature/x', materialState: 'ghost' })]
    tracker.applyToWorkUnits(units)
    expect(units[0]!.materialState).toBe('solid')
    expect(units[0]!.mergeEvidence).toBeTruthy()
  })

  it('leaves non-merged feature branch units as ghost', () => {
    const tracker = new BranchTracker()
    const units = [makeWorkUnit({ branch: 'feature/unmerged', materialState: 'ghost' })]

    tracker.applyToWorkUnits(units)
    expect(units[0]!.materialState).toBe('ghost')
  })

  it('never reverts solid to ghost', () => {
    const tracker = new BranchTracker()
    const units = [makeWorkUnit({ branch: 'feature/x', materialState: 'solid' })]

    tracker.applyToWorkUnits(units)
    expect(units[0]!.materialState).toBe('solid')
  })
})
