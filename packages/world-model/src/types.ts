// ============================================================================
// V3 Core Types — CanonicalWorkModel + WorldModel
// Pure data contracts. No geometry inference, no Pixi types.
// ============================================================================

// ---------------------------------------------------------------------------
// 1. Canonical Work Model (Ingest output — transcript truth)
// ---------------------------------------------------------------------------

/** Project-level metadata inferred from transcript */
export interface ProjectMeta {
  /** User-provided or inferred project name */
  name: string
  /** Confidence in project name inference */
  nameConfidence: 'user_provided' | 'inferred_slug' | 'inferred_cwd'
  /** Inferred repository roots (may be multiple for monorepos) */
  repos: RepoMeta[]
  /** Total observed unique file paths */
  observedFileCount: number
  /** Transcript source metadata */
  source: {
    format: 'claude_code_jsonl' | 'generic_jsonl'
    recordCount: number
    timeRange: { start: number; end: number } // ms epoch
  }
}

export interface RepoMeta {
  /** Absolute root path (as seen in transcript) */
  root: string
  /** Short name (basename or remote slug) */
  name: string
  /** Inference source */
  inferredFrom: 'cwd' | 'git_remote' | 'path_prefix' | 'user_provided'
  /** Active branches observed */
  branches: BranchMeta[]
}

export interface BranchMeta {
  name: string
  /** Is this the main/master/trunk branch? */
  isMain: boolean
  /** Confidence in main-branch detection */
  confidence: 'explicit' | 'convention' | 'guess'
}

/** A single normalized operation from transcript */
export interface CanonicalOperation {
  id: string
  timestamp: number // ms epoch
  actor: ActorRef
  kind: OperationKind
  /** File path target (normalized, absolute) */
  targetPath: string | null
  /** Repo this operation belongs to */
  repoRoot: string | null
  /** Branch context at time of operation */
  branch: string | null
  /** Tool name (for tool operations) */
  toolName: string | null
  /** Minimal context (truncated, scrubbed) */
  summary: string | null
  /** Raw source reference for debugging */
  rawRef: { file: string; line: number }
  /** Whether this operation resulted in an error */
  isError?: boolean
}

export type OperationKind =
  | 'file_read'
  | 'file_write'
  | 'file_create'
  | 'file_delete'
  | 'command_run'
  | 'search'
  | 'conversation'
  | 'reasoning'
  | 'task_spawn'
  | 'task_complete'
  | 'workitem_create'
  | 'workitem_update'
  | 'web_fetch'
  | 'merge'
  | 'branch_switch'
  | 'unknown'

export interface ActorRef {
  id: string
  kind: 'human' | 'agent' | 'subagent'
  /** Parent actor ID (for subagents) */
  parentId: string | null
  /** Display name */
  name: string
  /** Agent's task prompt (for name derivation in team sessions) */
  prompt?: string
}

/** The full canonical work model output from ingest */
export interface CanonicalWorkModel {
  project: ProjectMeta
  actors: ActorRef[]
  operations: CanonicalOperation[]
  /** Files-per-tile scaling factor (computed from observedFileCount) */
  filesPerTile: number
}

// ---------------------------------------------------------------------------
// 2. World Model (Layout-ready representation)
// ---------------------------------------------------------------------------

/** Branch-aware rendering state */
export type MaterialState = 'ghost' | 'solid'

export interface MergeEvidence {
  timestamp: number
  kind: 'explicit_merge' | 'branch_switch_touch' | 'pr_merge_command'
  confidence: 'high' | 'medium' | 'low'
}

/** A concrete file-backed work unit */
export interface WorkUnit {
  id: string
  /** Normalized file paths in this unit */
  paths: string[]
  /** Which repo this belongs to */
  repoRoot: string
  /** Which district this is assigned to (set during skeleton build) */
  districtId: string
  /** Work mass = weighted activity score */
  mass: number
  /** Branch state */
  branch: string | null
  materialState: MaterialState
  mergeEvidence: MergeEvidence | null
  /** Activity metrics */
  stats: {
    opCount: number
    editCount: number
    readCount: number
    commandCount: number
    lastTouched: number // ms epoch
    actors: string[] // actor IDs that touched this unit
    errorCount: number
    /** True when the last operation on this file is a delete with no subsequent create/write */
    deletedMarker?: boolean
  }
}

/** Tile size band derived from work mass */
export type SizeBand = 'S' | 'M' | 'L' | 'XL'

/** Layout rectangle (tile-grid coordinates, not pixels) */
export interface LayoutRect {
  x: number
  y: number
  width: number
  height: number
}

/** Base node in the world hierarchy */
export interface WorldNode {
  id: string
  name: string
  layout: LayoutRect
  /** Used capacity (sum of child mass) */
  usedCapacity: number
  /** Maximum capacity before growth trigger */
  maxCapacity: number
}

export interface WMWorld extends WorldNode {
  islands: WMIsland[]
}

export interface WMIsland extends WorldNode {
  repoRoot: string
  biome: string
  districts: WMDistrict[]
}

export interface WMDistrict extends WorldNode {
  islandId: string
  pathPrefix: string
  buildings: WMBuilding[]
}

export interface WMBuilding extends WorldNode {
  districtId: string
  workUnitIds: string[]
  sizeBand: SizeBand
  /** Aggregate branch state (ghost if ALL units are ghost) */
  materialState: MaterialState
}

/** Complete world model snapshot */
export interface WorldModelSnapshot {
  version: number
  generatedAt: number
  world: WMWorld
  workUnits: WorkUnit[]
  actors: ActorRef[]
  /** Layout solver metadata */
  layoutMeta: {
    seed: number
    filesPerTile: number
    totalObservedFiles: number
    solverIterations: number
  }
  /** Per-operation data for granular event generation (teams transcripts) */
  operations?: CanonicalOperation[]
}
