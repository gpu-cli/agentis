// ============================================================================
// Phase 3: Branch State Machine + Merge Detection
// ============================================================================

import type { CanonicalOperation, MaterialState, MergeEvidence, WorkUnit } from './types'

const MAIN_BRANCH_NAMES = new Set(['main', 'master', 'trunk'])

export class BranchTracker {
  /** Current branch per actor */
  private currentBranch = new Map<string, string>()
  /** Detected merges: branch name → evidence */
  private merges = new Map<string, MergeEvidence>()

  isMainBranch(name: string | null): boolean {
    if (!name) return true // unknown → benefit of doubt → solid
    const lower = name.toLowerCase()
    return MAIN_BRANCH_NAMES.has(lower) || lower.startsWith('main/') || lower.startsWith('master/')
  }

  /** Process an operation and return the material state for it */
  trackOperation(op: CanonicalOperation): MaterialState {
    if (op.branch) {
      this.currentBranch.set(op.actor.id, op.branch)
    }

    const branch = op.branch ?? this.currentBranch.get(op.actor.id) ?? null

    // Unknown branch → solid (benefit of doubt)
    if (!branch) return 'solid'

    // Main branch → always solid
    if (this.isMainBranch(branch)) return 'solid'

    // Non-main branch: check if merge evidence exists
    if (this.merges.has(branch)) return 'solid'

    return 'ghost'
  }

  /** Scan all operations for merge evidence signals */
  detectMerges(ops: CanonicalOperation[]): Map<string, MergeEvidence> {
    const branchSwitchTimes = new Map<string, { ts: number; actorId: string }>()

    for (const op of ops) {
      // High confidence: explicit merge commands
      if (op.kind === 'merge') {
        // Try to extract branch from summary
        const branch = this.extractMergeBranch(op.summary)
        if (branch) {
          this.merges.set(branch, {
            timestamp: op.timestamp,
            kind: 'explicit_merge',
            confidence: 'high',
          })
        }
        continue
      }

      // High confidence: PR merge commands in bash
      if (op.kind === 'command_run' && op.summary) {
        if (/gh\s+pr\s+merge/iu.test(op.summary)) {
          // Extract branch from PR context if available
          const branch = this.extractPRBranch(op.summary)
          if (branch) {
            this.merges.set(branch, {
              timestamp: op.timestamp,
              kind: 'pr_merge_command',
              confidence: 'high',
            })
          }
        }

        // High confidence: git merge command
        const gitMergeMatch = /git\s+merge\s+(\S+)/iu.exec(op.summary)
        if (gitMergeMatch?.[1]) {
          this.merges.set(gitMergeMatch[1], {
            timestamp: op.timestamp,
            kind: 'explicit_merge',
            confidence: 'high',
          })
        }
      }

      // Medium confidence: branch switch to main
      if (op.kind === 'branch_switch' && op.branch && this.isMainBranch(op.branch)) {
        branchSwitchTimes.set(op.actor.id, { ts: op.timestamp, actorId: op.actor.id })
      }

      // Medium confidence: file touch within 60s of branch switch to main
      if (
        (op.kind === 'file_write' || op.kind === 'file_create') &&
        op.targetPath
      ) {
        const switchInfo = branchSwitchTimes.get(op.actor.id)
        if (switchInfo && op.timestamp - switchInfo.ts < 60_000) {
          // The previous branch was likely merged
          const prevBranch = this.findPreviousBranch(ops, op.actor.id, switchInfo.ts)
          if (prevBranch && !this.isMainBranch(prevBranch) && !this.merges.has(prevBranch)) {
            this.merges.set(prevBranch, {
              timestamp: op.timestamp,
              kind: 'branch_switch_touch',
              confidence: 'medium',
            })
          }
        }
      }
    }

    return this.merges
  }

  /** Apply merge evidence to work units: ghost → solid for merged branches */
  applyToWorkUnits(workUnits: WorkUnit[]): void {
    for (const wu of workUnits) {
      if (wu.materialState === 'solid') continue // never revert
      if (!wu.branch) {
        wu.materialState = 'solid' // unknown → solid
        continue
      }
      if (this.isMainBranch(wu.branch)) {
        wu.materialState = 'solid'
        continue
      }
      const evidence = this.merges.get(wu.branch)
      if (evidence) {
        wu.materialState = 'solid'
        wu.mergeEvidence = evidence
      }
    }
  }

  private extractMergeBranch(summary: string | null): string | null {
    if (!summary) return null
    const match = /merge\s+(?:branch\s+)?['"]?(\S+?)['"]?\s/iu.exec(summary)
    return match?.[1] ?? null
  }

  private extractPRBranch(summary: string | null): string | null {
    if (!summary) return null
    // gh pr merge often has no branch in the command, try to get from context
    const match = /(?:branch|head)\s*[:=]\s*(\S+)/iu.exec(summary)
    return match?.[1] ?? null
  }

  private findPreviousBranch(
    ops: CanonicalOperation[],
    actorId: string,
    beforeTs: number,
  ): string | null {
    // Walk backwards to find the last branch this actor was on
    for (let i = ops.length - 1; i >= 0; i--) {
      const op = ops[i]!
      if (op.actor.id !== actorId) continue
      if (op.timestamp >= beforeTs) continue
      if (op.branch && !this.isMainBranch(op.branch)) return op.branch
    }
    return null
  }
}
