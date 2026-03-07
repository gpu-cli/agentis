// ============================================================================
// V3 Runtime Validators — Gate pipeline stages
// ============================================================================

import type {
  CanonicalWorkModel,
  WorldModelSnapshot,
  WMWorld,
  LayoutRect,
} from './types'

// ---------------------------------------------------------------------------
// Canonical Work Model validation
// ---------------------------------------------------------------------------

export function assertCanonicalWorkModel(model: unknown): asserts model is CanonicalWorkModel {
  if (typeof model !== 'object' || model === null) {
    throw new Error('CanonicalWorkModel must be a non-null object')
  }

  const m = model as Record<string, unknown>

  if (typeof m.project !== 'object' || m.project === null) {
    throw new Error('CanonicalWorkModel.project is required')
  }
  if (!Array.isArray(m.actors)) {
    throw new Error('CanonicalWorkModel.actors must be an array')
  }
  if (!Array.isArray(m.operations)) {
    throw new Error('CanonicalWorkModel.operations must be an array')
  }
  if (typeof m.filesPerTile !== 'number' || m.filesPerTile < 1) {
    throw new Error('CanonicalWorkModel.filesPerTile must be >= 1')
  }
}

// ---------------------------------------------------------------------------
// World Model Snapshot validation
// ---------------------------------------------------------------------------

export function assertWorldModelSnapshot(snapshot: unknown): asserts snapshot is WorldModelSnapshot {
  if (typeof snapshot !== 'object' || snapshot === null) {
    throw new Error('WorldModelSnapshot must be a non-null object')
  }

  const s = snapshot as Record<string, unknown>

  if (typeof s.version !== 'number') {
    throw new Error('WorldModelSnapshot.version is required')
  }
  if (typeof s.world !== 'object' || s.world === null) {
    throw new Error('WorldModelSnapshot.world is required')
  }
  if (!Array.isArray(s.workUnits)) {
    throw new Error('WorldModelSnapshot.workUnits must be an array')
  }
  if (!Array.isArray(s.actors)) {
    throw new Error('WorldModelSnapshot.actors must be an array')
  }
}

// ---------------------------------------------------------------------------
// Layout Invariant Checker
// ---------------------------------------------------------------------------

export interface LayoutViolation {
  kind: 'overlap' | 'containment' | 'spacing'
  message: string
  nodeA: string
  nodeB?: string
}

/** Check if two rects overlap (sharing an edge is NOT overlap) */
function rectsOverlap(a: LayoutRect, b: LayoutRect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}

/** Check if child rect is fully contained within parent rect (with tolerance) */
function isContained(child: LayoutRect, parent: LayoutRect, tolerance = 0.5): boolean {
  return (
    child.x >= parent.x - tolerance &&
    child.y >= parent.y - tolerance &&
    child.x + child.width <= parent.x + parent.width + tolerance &&
    child.y + child.height <= parent.y + parent.height + tolerance
  )
}

/** Minimum gap between sibling rects (tile units) */
const MIN_SPACING = 1

/** Check if two sibling rects have minimum spacing */
function hasMinSpacing(a: LayoutRect, b: LayoutRect): boolean {
  // If they don't overlap, check gap is >= MIN_SPACING
  const gapX = Math.max(0, Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width)))
  const gapY = Math.max(0, Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height)))

  // If aligned vertically (overlapping X ranges), check Y gap
  const xOverlap = a.x < b.x + b.width && a.x + a.width > b.x
  // If aligned horizontally (overlapping Y ranges), check X gap
  const yOverlap = a.y < b.y + b.height && a.y + a.height > b.y

  if (xOverlap && yOverlap) return false // overlapping = no spacing
  if (xOverlap) return gapY >= MIN_SPACING
  if (yOverlap) return gapX >= MIN_SPACING
  // Diagonal — either gap suffices
  return gapX >= MIN_SPACING || gapY >= MIN_SPACING
}

/**
 * Validate all layout invariants for a world model snapshot.
 * Returns empty array if all invariants pass.
 */
export function validateLayoutInvariants(world: WMWorld): LayoutViolation[] {
  const violations: LayoutViolation[] = []

  // Check island-level: no overlap between islands
  for (let i = 0; i < world.islands.length; i++) {
    for (let j = i + 1; j < world.islands.length; j++) {
      const a = world.islands[i]!
      const b = world.islands[j]!
      if (rectsOverlap(a.layout, b.layout)) {
        violations.push({
          kind: 'overlap',
          message: `Islands "${a.name}" and "${b.name}" overlap`,
          nodeA: a.id,
          nodeB: b.id,
        })
      }
      if (!hasMinSpacing(a.layout, b.layout)) {
        violations.push({
          kind: 'spacing',
          message: `Islands "${a.name}" and "${b.name}" lack minimum spacing`,
          nodeA: a.id,
          nodeB: b.id,
        })
      }
    }
  }

  // Check per-island: districts don't overlap, contained in island
  for (const island of world.islands) {
    for (const district of island.districts) {
      // Containment: district within island
      if (!isContained(district.layout, island.layout)) {
        violations.push({
          kind: 'containment',
          message: `District "${district.name}" not contained within island "${island.name}"`,
          nodeA: district.id,
          nodeB: island.id,
        })
      }

      // Per-district: buildings don't overlap, contained in district.
      // Building positions are district-relative, so we check containment
      // against a district rect at origin (0,0) with the district's dimensions.
      const districtLocal: LayoutRect = {
        x: 0,
        y: 0,
        width: district.layout.width,
        height: district.layout.height,
      }
      for (const building of district.buildings) {
        if (!isContained(building.layout, districtLocal)) {
          violations.push({
            kind: 'containment',
            message: `Building "${building.name}" not contained within district "${district.name}"`,
            nodeA: building.id,
            nodeB: district.id,
          })
        }
      }

      // Building-building overlap within district
      for (let i = 0; i < district.buildings.length; i++) {
        for (let j = i + 1; j < district.buildings.length; j++) {
          const a = district.buildings[i]!
          const b = district.buildings[j]!
          if (rectsOverlap(a.layout, b.layout)) {
            violations.push({
              kind: 'overlap',
              message: `Buildings "${a.name}" and "${b.name}" overlap in district "${district.name}"`,
              nodeA: a.id,
              nodeB: b.id,
            })
          }
        }
      }
    }

    // District-district overlap within island
    for (let i = 0; i < island.districts.length; i++) {
      for (let j = i + 1; j < island.districts.length; j++) {
        const a = island.districts[i]!
        const b = island.districts[j]!
        if (rectsOverlap(a.layout, b.layout)) {
          violations.push({
            kind: 'overlap',
            message: `Districts "${a.name}" and "${b.name}" overlap in island "${island.name}"`,
            nodeA: a.id,
            nodeB: b.id,
          })
        }
        if (!hasMinSpacing(a.layout, b.layout)) {
          violations.push({
            kind: 'spacing',
            message: `Districts "${a.name}" and "${b.name}" lack minimum spacing in island "${island.name}"`,
            nodeA: a.id,
            nodeB: b.id,
          })
        }
      }
    }
  }

  return violations
}
