// ============================================================================
// World Model — Public API
// Converts CanonicalWorkModel → WorldModelSnapshot with deterministic layout
// ============================================================================

// --- Core types ---
export type {
  // Canonical Work Model (ingest output)
  ProjectMeta,
  RepoMeta,
  BranchMeta,
  CanonicalOperation,
  OperationKind,
  ActorRef,
  CanonicalWorkModel,
  // Action Spans (timing-faithful tool invocations)
  ActionSpan,
  // World Model (layout-ready)
  MaterialState,
  MergeEvidence,
  WorkUnit,
  SizeBand,
  LayoutRect,
  WorldNode,
  WMWorld,
  WMIsland,
  WMDistrict,
  WMBuilding,
  WorldModelSnapshot,
} from './types'

// --- Action Span constants ---
export { PERCEPTUAL_FLOOR_MS } from './types'

// --- Validators ---
export {
  assertCanonicalWorkModel,
  assertWorldModelSnapshot,
  validateLayoutInvariants,
} from './validators'

// --- Work Units ---
export {
  buildWorkUnits,
  computeFilesPerTile,
  computeOutputScore,
  deriveSizeBand,
} from './work-units'

// --- Branch State ---
export {
  BranchTracker,
} from './branch-state'

// --- Clustering ---
export {
  clusterDistricts,
} from './clustering'

// --- Skeleton ---
export {
  buildWorldSkeleton,
} from './skeleton'

// --- Layout Solver ---
export {
  solveLayout,
  solveLayoutIncremental,
} from './layout-solver'
export type { LayoutTransitionMeta } from './layout-solver'

// --- Adapter ---
export {
  toScenarioData,
} from './adapter'

// --- Estimator ---
export {
  estimateBudget,
  HEAP_BUDGET_WARN,
  HEAP_BUDGET_MAX,
  MAX_TILES_WARN,
  MAX_TILES_HARD,
  MAX_EVENTS_WARN,
  MAX_EVENTS_HARD,
} from './estimator'
