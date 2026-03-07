// ============================================================================
// Multiverse — Biome System
// From: planning/ui-plans/ui-roadmap.md §2 Work Type Differentiation
// ============================================================================

export type BiomeType =
  | 'urban'
  | 'library'
  | 'arts'
  | 'harbor'
  | 'observatory'
  | 'industrial'
  | 'civic'

export interface BiomeConfig {
  key: BiomeType
  label: string
  work_type: string
  terrain: string
  building_style: string
  palette: string[]
  description: string
}

export const DEFAULT_BIOMES: Record<BiomeType, BiomeConfig> = {
  urban: {
    key: 'urban',
    label: 'Tech City',
    work_type: 'Engineering / Code',
    terrain: 'paved_roads_circuits',
    building_style: 'modern_industrial',
    palette: ['#1e3a5f', '#4a6fa5', '#6b8cae', '#94b8d4', '#00d4ff'],
    description: 'Paved roads, circuits. Modern/industrial buildings, server towers.',
  },
  library: {
    key: 'library',
    label: 'Library District',
    work_type: 'Documentation / Writing',
    terrain: 'cobblestone_hedges',
    building_style: 'libraries_archives',
    palette: ['#8b6914', '#c4a35a', '#d4b896', '#f5e6d3', '#fff8f0'],
    description: 'Cobblestone paths, hedges. Libraries, scroll archives, bookshelves.',
  },
  arts: {
    key: 'arts',
    label: 'Arts Quarter',
    work_type: 'Design / Creative',
    terrain: 'mosaic_paths',
    building_style: 'studios_galleries',
    palette: ['#7b2d8b', '#c44dba', '#ff6b9d', '#ff9a56', '#ffd93d'],
    description: 'Colorful mosaic paths. Studios, galleries, workshops.',
  },
  harbor: {
    key: 'harbor',
    label: 'Harbor',
    work_type: 'Communications / Comms',
    terrain: 'docks_waterways',
    building_style: 'lighthouses_signal',
    palette: ['#0d4f4f', '#1a8585', '#2ec4b6', '#a8dadc', '#f1faee'],
    description: 'Docks, waterways. Lighthouses, post offices, signal towers.',
  },
  observatory: {
    key: 'observatory',
    label: 'Observatory Highlands',
    work_type: 'Research / Analysis',
    terrain: 'mountain_paths',
    building_style: 'observatories_labs',
    palette: ['#0d1b2a', '#1b2838', '#2c3e50', '#7f8c8d', '#ecf0f1'],
    description: 'Mountain paths, telescopes. Observatories, labs, research stations.',
  },
  industrial: {
    key: 'industrial',
    label: 'Industrial Zone',
    work_type: 'Operations / DevOps',
    terrain: 'rail_tracks_pipes',
    building_style: 'factories_power',
    palette: ['#d35400', '#e67e22', '#95a5a6', '#7f8c8d', '#f39c12'],
    description: 'Rail tracks, pipes. Factories, power stations, control rooms.',
  },
  civic: {
    key: 'civic',
    label: 'Town Hall',
    work_type: 'Project Management',
    terrain: 'wide_roads_plazas',
    building_style: 'town_halls_civic',
    palette: ['#27ae60', '#2ecc71', '#a93226', '#d4ac0d', '#fef9e7'],
    description: 'Wide roads, plazas. Town halls, bulletin boards, clock towers.',
  },
}
