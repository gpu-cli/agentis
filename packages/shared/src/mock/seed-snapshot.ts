// ============================================================================
// Multiverse — Seed Snapshot
// Pre-seeded world state for all mock scenarios
// ============================================================================

import type { PlanetSnapshot } from '../events'
import type {
  Island,
  District,
  Building,
  Tile,
  Agent,
  WorldCoord,
  DistrictConnection,
} from '../types'

// ---------------------------------------------------------------------------
// Helper: create a WorldCoord
// ---------------------------------------------------------------------------
function wc(
  chunk_x: number,
  chunk_y: number,
  local_x: number,
  local_y: number,
): WorldCoord {
  return { chunk_x, chunk_y, local_x, local_y }
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

function createAgents(): Agent[] {
  return [
    {
      id: 'agent_eng_1',
      universe_id: 'universe_acme',
      name: 'Nova',
      type: 'claude',
      sprite_config: {
        sprite_sheet: 'agents/claude',
        idle_animation: 'idle',
        walk_animation: 'walk',
        combat_animation: 'combat',
        color_tint: 0xd97706,
      },
      status: 'idle',
      current_planet_id: 'planet_p1',
      // Inside Auth Service district: position wc(0,0,15,15), bounds 13×10
      // → local_x 15–28, local_y 15–25. Place at (20,18) — center of Auth.
      position: wc(0, 0, 20, 18),
      vision_radius: 5,
      tools: [
        { tool_id: 'tool_code_edit', enabled: true, usage_count: 0 },
        { tool_id: 'tool_web_search', enabled: true, usage_count: 0 },
        { tool_id: 'tool_testing', enabled: true, usage_count: 0 },
        { tool_id: 'tool_git', enabled: true, usage_count: 0 },
        { tool_id: 'tool_deploy', enabled: true, usage_count: 0 },
        { tool_id: 'tool_documentation', enabled: true, usage_count: 0 },
      ],
    },
    {
      id: 'agent_ops_1',
      universe_id: 'universe_acme',
      name: 'Forge',
      type: 'cursor',
      sprite_config: {
        sprite_sheet: 'agents/cursor',
        idle_animation: 'idle',
        walk_animation: 'walk',
        combat_animation: 'combat',
        color_tint: 0x3b82f6,
      },
      status: 'idle',
      current_planet_id: 'planet_p1',
      // Inside Infrastructure district: position wc(0,0,30,15), bounds 10×10
      // → local_x 30–40, local_y 15–25. Place at (34,19).
      position: wc(0, 0, 34, 19),
      vision_radius: 5,
      tools: [
        { tool_id: 'tool_deploy', enabled: true, usage_count: 0 },
        { tool_id: 'tool_code_edit', enabled: true, usage_count: 0 },
        { tool_id: 'tool_git', enabled: true, usage_count: 0 },
        { tool_id: 'tool_terminal', enabled: true, usage_count: 0 },
        { tool_id: 'tool_slack', enabled: true, usage_count: 0 },
      ],
    },
    {
      id: 'agent_eng_2',
      universe_id: 'universe_acme',
      name: 'Iris',
      type: 'codex',
      sprite_config: {
        sprite_sheet: 'agents/codex',
        idle_animation: 'idle',
        walk_animation: 'walk',
        combat_animation: 'combat',
        color_tint: 0x10a37f,
      },
      status: 'idle',
      current_planet_id: 'planet_p1',
      // Inside Auth Service district: position wc(0,0,15,15), bounds 13×10
      // → local_x 15–28, local_y 15–25. Place at (24,20).
      position: wc(0, 0, 24, 20),
      vision_radius: 5,
      tools: [
        { tool_id: 'tool_code_edit', enabled: true, usage_count: 0 },
        { tool_id: 'tool_web_search', enabled: true, usage_count: 0 },
        { tool_id: 'tool_testing', enabled: true, usage_count: 0 },
        { tool_id: 'tool_git', enabled: true, usage_count: 0 },
        { tool_id: 'tool_slack', enabled: true, usage_count: 0 },
      ],
    },
    {
      id: 'agent_researcher_1',
      universe_id: 'universe_acme',
      name: 'Atlas',
      type: 'gemini',
      sprite_config: {
        sprite_sheet: 'agents/gemini',
        idle_animation: 'idle',
        walk_animation: 'walk',
        color_tint: 0x4285f4,
      },
      status: 'idle',
      current_planet_id: 'planet_p1',
      // Inside Documentation district: position wc(0,0,16,28), bounds 12×8
      // → local_x 16–28, local_y 28–36. Place at (21,31).
      position: wc(0, 0, 21, 31),
      vision_radius: 5,
      tools: [
        { tool_id: 'tool_web_search', enabled: true, usage_count: 0 },
        { tool_id: 'tool_file_read', enabled: true, usage_count: 0 },
        { tool_id: 'tool_documentation', enabled: true, usage_count: 0 },
        { tool_id: 'tool_slack', enabled: true, usage_count: 0 },
      ],
    },
  ]
}

// ---------------------------------------------------------------------------
// Map Entities
// ---------------------------------------------------------------------------

function createIslands(): Island[] {
  return [
    {
      id: 'island_repo_api',
      planet_id: 'planet_p1',
      name: 'API Repository',
      external_ref: { source: 'github', source_id: 'acme/api' },
      position: wc(0, 0, 10, 10),
      biome: 'urban',
      bounds: { width: 40, height: 35 },
    },
  ]
}

function createDistricts(): District[] {
  return [
    {
      id: 'district_auth',
      island_id: 'island_repo_api',
      name: 'Auth Service',
      position: wc(0, 0, 15, 15),
      bounds: { width: 13, height: 10 },
    },
    {
      id: 'district_infra',
      island_id: 'island_repo_api',
      name: 'Infrastructure',
      position: wc(0, 0, 30, 15),
      bounds: { width: 10, height: 10 },
      biome_override: 'industrial',
    },
    {
      id: 'district_docs',
      island_id: 'island_repo_api',
      name: 'Documentation',
      position: wc(0, 0, 16, 28),
      bounds: { width: 12, height: 8 },
      biome_override: 'library',
    },
  ]
}

function createBuildings(): Building[] {
  return [
    // ── Auth Service district ──────────────────────────────────────────────
    {
      id: 'bld_auth',
      district_id: 'district_auth',
      name: 'Auth',
      external_ref: { source: 'github', source_id: 'src/auth' },
      position: wc(0, 0, 16, 17),
      footprint: { width: 3, height: 2 },
      style: 'modern_office',
      file_count: 2,
      health: 50,
    },
    {
      id: 'bld_routes',
      district_id: 'district_auth',
      name: 'Routing',
      external_ref: { source: 'github', source_id: 'src/routes' },
      position: wc(0, 0, 20, 17),
      footprint: { width: 4, height: 3 },
      style: 'modern_office',
      file_count: 5,
      health: 100,
    },
    {
      id: 'bld_middleware',
      district_id: 'district_auth',
      name: 'Middleware',
      external_ref: { source: 'github', source_id: 'src/middleware' },
      position: wc(0, 0, 16, 20),
      footprint: { width: 2, height: 2 },
      style: 'modern_office',
      file_count: 1,
      health: 25,
    },
    {
      id: 'bld_sessions',
      district_id: 'district_auth',
      name: 'Sessions',
      external_ref: { source: 'github', source_id: 'src/sessions' },
      position: wc(0, 0, 25, 17),
      footprint: { width: 2, height: 2 },
      style: 'server_tower',
      file_count: 2,
      health: 75,
    },

    // ── Infrastructure district ────────────────────────────────────────────
    {
      id: 'bld_config',
      district_id: 'district_infra',
      name: 'Config',
      external_ref: { source: 'github', source_id: 'infra/config' },
      position: wc(0, 0, 31, 17),
      footprint: { width: 3, height: 2 },
      style: 'factory',
      file_count: 3,
      health: 100,
    },
    {
      id: 'bld_service',
      district_id: 'district_infra',
      name: 'Service',
      external_ref: { source: 'github', source_id: 'src/service' },
      position: wc(0, 0, 31, 20),
      footprint: { width: 4, height: 3 },
      style: 'server_tower',
      file_count: 6,
      health: 100,
    },
    {
      id: 'bld_monitoring',
      district_id: 'district_infra',
      name: 'Monitoring',
      external_ref: { source: 'github', source_id: 'infra/monitoring' },
      position: wc(0, 0, 36, 17),
      footprint: { width: 2, height: 2 },
      style: 'factory',
      file_count: 1,
      health: 30,
    },
    {
      id: 'bld_ci_pipeline',
      district_id: 'district_infra',
      name: 'CI Pipeline',
      external_ref: { source: 'github', source_id: 'infra/ci' },
      position: wc(0, 0, 36, 20),
      footprint: { width: 2, height: 2 },
      style: 'factory',
      file_count: 2,
      health: 60,
    },

    // ── Documentation district ─────────────────────────────────────────────
    {
      id: 'bld_docs',
      district_id: 'district_docs',
      name: 'Docs',
      external_ref: { source: 'github', source_id: 'docs' },
      position: wc(0, 0, 17, 30),
      footprint: { width: 3, height: 2 },
      style: 'library',
      file_count: 2,
      health: 40,
    },
    {
      id: 'bld_docs_arch',
      district_id: 'district_docs',
      name: 'Architecture',
      external_ref: { source: 'github', source_id: 'docs/architecture' },
      position: wc(0, 0, 21, 30),
      footprint: { width: 3, height: 3 },
      style: 'library',
      file_count: 4,
      health: 85,
    },
    {
      id: 'bld_api_reference',
      district_id: 'district_docs',
      name: 'API Reference',
      external_ref: { source: 'github', source_id: 'docs/api' },
      position: wc(0, 0, 25, 30),
      footprint: { width: 2, height: 2 },
      style: 'library',
      file_count: 1,
      health: 15,
    },
  ]
}

function createTiles(): Tile[] {
  const now = Date.now()
  return [
    // ── Auth (50%, 2 files) ──
    {
      id: 'tile_auth_handler',
      building_id: 'bld_auth',
      external_ref: { source: 'github', source_id: 'src/auth/handler.ts' },
      file_name: 'handler.ts',
      position: { x: 0, y: 0 },
      state: 'building',
      last_modified: now,
    },
    {
      id: 'tile_auth_types',
      building_id: 'bld_auth',
      external_ref: { source: 'github', source_id: 'src/auth/types.ts' },
      file_name: 'types.ts',
      position: { x: 1, y: 0 },
      state: 'scaffolding',
      last_modified: now,
    },

    // ── Routes (100%, 5 files) ──
    {
      id: 'tile_routes_ts',
      building_id: 'bld_routes',
      external_ref: { source: 'github', source_id: 'src/routes.ts' },
      file_name: 'routes.ts',
      position: { x: 0, y: 0 },
      state: 'complete',
      last_modified: now,
    },
    {
      id: 'tile_routes_auth',
      building_id: 'bld_routes',
      external_ref: { source: 'github', source_id: 'src/routes/auth.ts' },
      file_name: 'auth.ts',
      position: { x: 1, y: 0 },
      state: 'complete',
      last_modified: now,
    },
    {
      id: 'tile_routes_users',
      building_id: 'bld_routes',
      external_ref: { source: 'github', source_id: 'src/routes/users.ts' },
      file_name: 'users.ts',
      position: { x: 2, y: 0 },
      state: 'complete',
      last_modified: now,
    },
    {
      id: 'tile_routes_health',
      building_id: 'bld_routes',
      external_ref: { source: 'github', source_id: 'src/routes/health.ts' },
      file_name: 'health.ts',
      position: { x: 0, y: 1 },
      state: 'complete',
      last_modified: now,
    },
    {
      id: 'tile_routes_middleware',
      building_id: 'bld_routes',
      external_ref: { source: 'github', source_id: 'src/routes/middleware.ts' },
      file_name: 'middleware.ts',
      position: { x: 1, y: 1 },
      state: 'complete',
      last_modified: now,
    },

    // ── Middleware (25%, 1 file) ──
    {
      id: 'tile_mw_cors',
      building_id: 'bld_middleware',
      external_ref: { source: 'github', source_id: 'src/middleware/cors.ts' },
      file_name: 'cors.ts',
      position: { x: 0, y: 0 },
      state: 'scaffolding',
      last_modified: now,
    },

    // ── Sessions (75%, 2 files) ──
    {
      id: 'tile_session_store',
      building_id: 'bld_sessions',
      external_ref: { source: 'github', source_id: 'src/sessions/store.ts' },
      file_name: 'store.ts',
      position: { x: 0, y: 0 },
      state: 'complete',
      last_modified: now,
    },
    {
      id: 'tile_session_redis',
      building_id: 'bld_sessions',
      external_ref: { source: 'github', source_id: 'src/sessions/redis.ts' },
      file_name: 'redis.ts',
      position: { x: 1, y: 0 },
      state: 'building',
      last_modified: now,
    },

    // ── Config (100%, 3 files) ──
    {
      id: 'tile_prod_env',
      building_id: 'bld_config',
      external_ref: { source: 'github', source_id: 'infra/prod.env' },
      file_name: 'prod.env',
      position: { x: 0, y: 0 },
      state: 'complete',
      last_modified: now,
    },
    {
      id: 'tile_staging_env',
      building_id: 'bld_config',
      external_ref: { source: 'github', source_id: 'infra/staging.env' },
      file_name: 'staging.env',
      position: { x: 1, y: 0 },
      state: 'complete',
      last_modified: now,
    },
    {
      id: 'tile_config_schema',
      building_id: 'bld_config',
      external_ref: { source: 'github', source_id: 'infra/config.schema.json' },
      file_name: 'config.schema.json',
      position: { x: 2, y: 0 },
      state: 'complete',
      last_modified: now,
    },

    // ── Service (100%, 6 files) ──
    {
      id: 'tile_service_main',
      building_id: 'bld_service',
      external_ref: { source: 'github', source_id: 'src/service/main.ts' },
      file_name: 'main.ts',
      position: { x: 0, y: 0 },
      state: 'complete',
      last_modified: now,
    },
    {
      id: 'tile_service_client',
      building_id: 'bld_service',
      external_ref: { source: 'github', source_id: 'src/service/client.ts' },
      file_name: 'client.ts',
      position: { x: 1, y: 0 },
      state: 'complete',
      last_modified: now,
    },
    {
      id: 'tile_service_handler',
      building_id: 'bld_service',
      external_ref: { source: 'github', source_id: 'src/service/handler.ts' },
      file_name: 'handler.ts',
      position: { x: 2, y: 0 },
      state: 'complete',
      last_modified: now,
    },
    {
      id: 'tile_service_types',
      building_id: 'bld_service',
      external_ref: { source: 'github', source_id: 'src/service/types.ts' },
      file_name: 'types.ts',
      position: { x: 0, y: 1 },
      state: 'complete',
      last_modified: now,
    },
    {
      id: 'tile_service_utils',
      building_id: 'bld_service',
      external_ref: { source: 'github', source_id: 'src/service/utils.ts' },
      file_name: 'utils.ts',
      position: { x: 1, y: 1 },
      state: 'complete',
      last_modified: now,
    },
    {
      id: 'tile_service_errors',
      building_id: 'bld_service',
      external_ref: { source: 'github', source_id: 'src/service/errors.ts' },
      file_name: 'errors.ts',
      position: { x: 2, y: 1 },
      state: 'complete',
      last_modified: now,
    },

    // ── Monitoring (30%, 1 file) ──
    {
      id: 'tile_monitor_dashboard',
      building_id: 'bld_monitoring',
      external_ref: { source: 'github', source_id: 'infra/monitoring/dashboard.yaml' },
      file_name: 'dashboard.yaml',
      position: { x: 0, y: 0 },
      state: 'scaffolding',
      last_modified: now,
    },

    // ── CI Pipeline (60%, 2 files) ──
    {
      id: 'tile_ci_main',
      building_id: 'bld_ci_pipeline',
      external_ref: { source: 'github', source_id: 'infra/ci/main.yaml' },
      file_name: 'main.yaml',
      position: { x: 0, y: 0 },
      state: 'complete',
      last_modified: now,
    },
    {
      id: 'tile_ci_deploy',
      building_id: 'bld_ci_pipeline',
      external_ref: { source: 'github', source_id: 'infra/ci/deploy.yaml' },
      file_name: 'deploy.yaml',
      position: { x: 1, y: 0 },
      state: 'building',
      last_modified: now,
    },

    // ── Docs (40%, 2 files) ──
    {
      id: 'tile_docs_readme',
      building_id: 'bld_docs',
      external_ref: { source: 'github', source_id: 'docs/README.md' },
      file_name: 'README.md',
      position: { x: 0, y: 0 },
      state: 'building',
      last_modified: now,
    },
    {
      id: 'tile_docs_setup',
      building_id: 'bld_docs',
      external_ref: { source: 'github', source_id: 'docs/setup.md' },
      file_name: 'setup.md',
      position: { x: 1, y: 0 },
      state: 'scaffolding',
      last_modified: now,
    },

    // ── Architecture (85%, 4 files) ──
    {
      id: 'tile_arch_overview',
      building_id: 'bld_docs_arch',
      external_ref: { source: 'github', source_id: 'docs/architecture/overview.md' },
      file_name: 'overview.md',
      position: { x: 0, y: 0 },
      state: 'complete',
      last_modified: now,
    },
    {
      id: 'tile_arch_decisions',
      building_id: 'bld_docs_arch',
      external_ref: { source: 'github', source_id: 'docs/architecture/decisions.md' },
      file_name: 'decisions.md',
      position: { x: 1, y: 0 },
      state: 'complete',
      last_modified: now,
    },
    {
      id: 'tile_arch_diagrams',
      building_id: 'bld_docs_arch',
      external_ref: { source: 'github', source_id: 'docs/architecture/diagrams.md' },
      file_name: 'diagrams.md',
      position: { x: 2, y: 0 },
      state: 'complete',
      last_modified: now,
    },
    {
      id: 'tile_arch_api',
      building_id: 'bld_docs_arch',
      external_ref: { source: 'github', source_id: 'docs/architecture/api.md' },
      file_name: 'api.md',
      position: { x: 0, y: 1 },
      state: 'building',
      last_modified: now,
    },

    // ── API Reference (15%, 1 file) ──
    {
      id: 'tile_apiref_endpoints',
      building_id: 'bld_api_reference',
      external_ref: { source: 'github', source_id: 'docs/api/endpoints.md' },
      file_name: 'endpoints.md',
      position: { x: 0, y: 0 },
      state: 'scaffolding',
      last_modified: now,
    },
  ]
}

// ---------------------------------------------------------------------------
// Connections between districts
// ---------------------------------------------------------------------------

function createConnections(): DistrictConnection[] {
  return [
    {
      id: 'conn_auth_infra',
      from_district_id: 'district_auth',
      to_district_id: 'district_infra',
      connection_type: 'api',
      label: 'REST API',
    },
    {
      id: 'conn_auth_docs',
      from_district_id: 'district_auth',
      to_district_id: 'district_docs',
      connection_type: 'dependency',
      label: 'Docs',
    },
  ]
}

// ---------------------------------------------------------------------------
// Create Snapshot
// ---------------------------------------------------------------------------

export function createSeedSnapshot(): PlanetSnapshot {
  return {
    snapshot_version: 1,
    planet_id: 'planet_p1',
    planet_name: 'Acme World',
    generated_at: Date.now(),
    agent_cursors: {
      agent_eng_1: 0,
      agent_ops_1: 0,
      agent_eng_2: 0,
      agent_researcher_1: 0,
    },
    islands: createIslands(),
    districts: createDistricts(),
    buildings: createBuildings(),
    tiles: createTiles(),
    agents: createAgents(),
    sub_agents: [],
    monsters: [],
    work_items: [],
    connections: createConnections(),
  }
}
