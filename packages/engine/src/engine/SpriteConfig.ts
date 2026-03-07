// ============================================================================
// Sprite Configuration — Maps game concepts to sprite sheet regions
// Defines where in each sprite sheet to find specific sprites.
// Coordinates reference the Kenney Tiny Town + Tiny Dungeon tilemap_packed.png
// files (192x176, 12 cols × 11 rows, 16×16 per tile, no spacing).
// ============================================================================

// ---------------------------------------------------------------------------
// Sprite Region Definition
// ---------------------------------------------------------------------------

export interface SpriteRegion {
  /** Sprite sheet key (registered with PixiJS Assets) */
  sheet: string
  /** Pixel x offset in the sheet */
  x: number
  /** Pixel y offset in the sheet */
  y: number
  /** Pixel width of the sprite */
  width: number
  /** Pixel height of the sprite */
  height: number
  /** Number of animation frames (horizontal strip). 1 = static sprite */
  frames?: number
}

// ---------------------------------------------------------------------------
// Sprite Sheet Keys
// ---------------------------------------------------------------------------

export const SHEET_KEYS = {
  TINY_TOWN: 'tileset-tiny-town',
  TINY_DUNGEON: 'tileset-tiny-dungeon',
  PARTICLES: 'particles',
  UI: 'ui-pack',
  GAME_ICONS: 'game-icons',
  PLACEHOLDER: 'placeholder-generated',
} as const

// ---------------------------------------------------------------------------
// Asset Paths — URLs served from public/ via Vite
// ---------------------------------------------------------------------------

export const ASSET_PATHS = {
  // Tilemap sprite sheets (192×176 packed, no spacing)
  TINY_TOWN: '/assets/tilesets/tilemap_tiny-town.png',
  TINY_DUNGEON: '/assets/tilesets/tilemap_tiny-dungeon.png',
  UI_TILEMAP: '/assets/ui/tilemap_ui.png',
  // Particle PNGs (individual files, 512×512)
  PARTICLE_CIRCLE: '/assets/particles/circle_01.png',
  PARTICLE_SPARK: '/assets/particles/spark_01.png',
  PARTICLE_SMOKE: '/assets/particles/smoke_01.png',
  PARTICLE_TRAIL: '/assets/particles/trace_01.png',
  PARTICLE_FIRE: '/assets/particles/fire_01.png',
  PARTICLE_FLAME: '/assets/particles/flame_01.png',
  PARTICLE_MAGIC: '/assets/particles/magic_01.png',
  PARTICLE_STAR: '/assets/particles/star_01.png',
  PARTICLE_FLARE: '/assets/particles/flare_01.png',
  PARTICLE_SLASH: '/assets/particles/slash_01.png',
  // Game icon PNGs (individual files, 100×100 white on transparent)
  ICON_EXCLAMATION: '/assets/icons/exclamation.png',
  ICON_CHECKMARK: '/assets/icons/checkmark.png',
  ICON_CROSS: '/assets/icons/cross.png',
  ICON_STAR: '/assets/icons/star.png',
  ICON_LOCKED: '/assets/icons/locked.png',
  ICON_WARNING: '/assets/icons/warning.png',
  ICON_TARGET: '/assets/icons/target.png',
  ICON_WRENCH: '/assets/icons/wrench.png',
  ICON_GEAR: '/assets/icons/gear.png',
  ICON_POWER: '/assets/icons/power.png',
} as const

// ---------------------------------------------------------------------------
// Placeholder Colors (used by AssetLoader to generate fallback textures)
// ---------------------------------------------------------------------------

export const AGENT_COLORS: Record<string, number> = {
  claude: 0xd97706,
  cursor: 0x3b82f6,
  codex: 0x10a37f,
  gemini: 0x4285f4,
  openclaw: 0xef4444,
}

export const BIOME_COLORS: Record<string, number> = {
  urban: 0x3a7abf,
  library: 0xc49a2a,
  industrial: 0xe87830,
  observatory: 0x2a5a9a,
  arts: 0xb04ac0,
  harbor: 0x2a8a8a,
  civic: 0x3cc870,
}

export const TILE_STATE_COLORS: Record<string, number> = {
  scaffolding: 0x555555,
  building: 0x4a90d9,
  complete: 0x27ae60,
  ruins: 0x8b4513,
}

export const TOOL_COLORS: Record<string, number> = {
  tool_email: 0x3498db,
  tool_code_edit: 0xe67e22,
  tool_web_search: 0x3498db,
  tool_slack: 0x2ecc71,
  tool_file_read: 0x1abc9c,
  tool_git: 0x8e44ad,
  tool_deploy: 0xe74c3c,
  tool_database: 0x9b59b6,
  tool_api_call: 0xf1c40f,
  tool_testing: 0x27ae60,
  tool_documentation: 0xf39c12,
  tool_image_gen: 0xff6b9d,
  tool_terminal: 0x2c3e50,
}

/** Short text labels for tools — no emojis. Visual icon is provided by TOOL_SPRITE_MAP sprites. */
export const TOOL_SYMBOLS: Record<string, string> = {
  tool_email: 'Mail',
  tool_code_edit: 'Edit',
  tool_web_search: 'Search',
  tool_slack: 'Chat',
  tool_file_read: 'Read',
  tool_git: 'Git',
  tool_deploy: 'Deploy',
  tool_database: 'DB',
  tool_api_call: 'API',
  tool_testing: 'Test',
  tool_documentation: 'Docs',
  tool_image_gen: 'Gen',
  tool_terminal: 'Term',
}

export const MONSTER_COLORS: Record<string, number> = {
  slime: 0x7ec850,
  skeleton: 0xd4d4d4,
  golem: 0x8b6914,
  dragon: 0xe74c3c,
}

export const STATUS_COLORS: Record<string, number> = {
  active: 0x27ae60,
  idle: 0xf39c12,
  combat: 0xe74c3c,
  offline: 0x7f8c8d,
}

// ---------------------------------------------------------------------------
// Biome Ground Tile Types — maps biome to available ground tile types
// ---------------------------------------------------------------------------

export const BIOME_GROUND_TYPES: Record<string, string[]> = {
  urban: ['road', 'sidewalk', 'circuit', 'grass_patch'],
  library: ['cobblestone', 'hedge', 'carpet', 'wood_floor'],
  industrial: ['rail', 'pipe_grate', 'metal_floor', 'gravel'],
  observatory: ['mountain_path', 'stone', 'snow', 'glass_floor'],
  arts: ['mosaic_warm', 'mosaic_cool', 'paint_splat', 'tile_pastel'],
  harbor: ['dock_wood', 'water_shallow', 'sand', 'rope_bridge'],
  civic: ['plaza_stone', 'brick_wide', 'garden', 'fountain_edge'],
}

// ---------------------------------------------------------------------------
// Tilemap Region Helpers
// Both Tiny Town and Tiny Dungeon are 12 cols × 11 rows of 16×16 tiles
// in a 192×176 packed tilemap (no spacing between tiles).
// Tile index N → col = N % 12, row = floor(N / 12)
// Pixel position → x = col * 16, y = row * 16
// ---------------------------------------------------------------------------

/** Compute a Tiny Town sprite region from grid col/row */
function tt(col: number, row: number, frames?: number): SpriteRegion {
  return {
    sheet: SHEET_KEYS.TINY_TOWN,
    x: col * 16,
    y: row * 16,
    width: 16,
    height: 16,
    ...(frames ? { frames } : {}),
  }
}

/** Compute a Tiny Dungeon sprite region from grid col/row */
function td(col: number, row: number, frames?: number): SpriteRegion {
  return {
    sheet: SHEET_KEYS.TINY_DUNGEON,
    x: col * 16,
    y: row * 16,
    width: 16,
    height: 16,
    ...(frames ? { frames } : {}),
  }
}

// ---------------------------------------------------------------------------
// Sprite Sheet Regions — Kenney Tiny Town (192×176 tilemap_packed.png)
//
// Layout (12 cols × 11 rows):
//   Row 0:  Grass variants, trees (green), trees (autumn/orange)
//   Row 1:  Dirt/sand/rock, bushes/flowers, more autumn trees
//   Row 2:  Path tiles, red roof tiles, blue roof tiles
//   Row 3:  Cobblestone tiles, brown roof tiles, pipe pieces
//   Row 4:  Wood wall tiles, door/window, brick wall tiles, more pipes
//   Row 5:  Brick walls cont., grey wall tiles, signs, coins
//   Row 6:  Stone wall tiles, crate/barrel, food items
//   Row 7:  Castle wall tiles, castle gate, misc small items
//   Row 8:  Fortress wall tiles, gate arch, tools
//   Row 9:  Fence/bridge pieces, more tools
//   Row 10: Water tiles, sign post, graves, weapons
// ---------------------------------------------------------------------------

export const TINY_TOWN_REGIONS = {
  // --- Row 0: Grass + Trees (green/autumn) ---
  grass_1:       tt(0, 0),   // Light grass
  grass_2:       tt(1, 0),   // Medium grass
  grass_flower:  tt(2, 0),   // Grass with flowers
  grass_detail:  tt(3, 0),   // Grass with detail
  tree_green_1:  tt(4, 0),   // Small green tree
  tree_green_2:  tt(5, 0),   // Medium green tree
  tree_green_3:  tt(6, 0),   // Tall green tree
  tree_dead:     tt(7, 0),   // Dead/bare tree
  tree_autumn_1: tt(8, 0),   // Autumn tree (orange)
  tree_autumn_2: tt(9, 0),   // Autumn tree variant
  tree_autumn_3: tt(10, 0),  // Autumn tree variant
  tree_fire:     tt(11, 0),  // Fire/burning tree

  // --- Row 1: Terrain + Bushes ---
  dirt_1:        tt(0, 1),   // Dirt patch
  dirt_2:        tt(1, 1),   // Dirt variant
  sand:          tt(2, 1),   // Sandy ground
  rock:          tt(3, 1),   // Rocky ground
  bush_1:        tt(4, 1),   // Bush
  bush_2:        tt(5, 1),   // Shrub
  flower_1:      tt(6, 1),   // Flower cluster
  flower_2:      tt(7, 1),   // Flower variant
  tree_autumn_4: tt(8, 1),   // More autumn trees
  tree_autumn_5: tt(9, 1),
  tree_autumn_6: tt(10, 1),
  tree_fire_2:   tt(11, 1),  // Burning tree variant

  // --- Row 2: Paths + Rooftops ---
  path_1:        tt(0, 2),   // Path tile
  path_2:        tt(1, 2),   // Path variant
  path_3:        tt(2, 2),   // Path variant
  path_4:        tt(3, 2),   // Path variant
  roof_red_tl:   tt(4, 2),   // Red roof top-left
  roof_red_tr:   tt(5, 2),   // Red roof top-right
  roof_red_bl:   tt(6, 2),   // Red roof bottom-left
  roof_red_br:   tt(7, 2),   // Red roof bottom-right
  roof_blue_tl:  tt(8, 2),   // Blue roof top-left
  roof_blue_tr:  tt(9, 2),   // Blue roof top-right
  roof_blue_bl:  tt(10, 2),  // Blue roof bottom-left
  roof_blue_br:  tt(11, 2),  // Blue roof bottom-right

  // --- Row 3: Cobblestone + Brown Roofs + Pipes ---
  cobble_1:      tt(0, 3),   // Cobblestone
  cobble_2:      tt(1, 3),   // Cobblestone variant
  cobble_3:      tt(2, 3),   // Cobblestone variant
  cobble_4:      tt(3, 3),   // Cobblestone variant
  roof_brown_tl: tt(4, 3),   // Brown roof top-left
  roof_brown_tr: tt(5, 3),   // Brown roof top-right
  roof_brown_bl: tt(6, 3),   // Brown roof bottom-left
  roof_brown_br: tt(7, 3),   // Brown roof bottom-right
  wall_brown_1:  tt(8, 3),   // Brown wall
  wall_brown_2:  tt(9, 3),   // Brown wall variant
  pipe_v:        tt(10, 3),  // Vertical pipe
  pipe_h:        tt(11, 3),  // Horizontal pipe

  // --- Row 4: Wood/Brick Walls + Pipes ---
  wall_wood_tl:  tt(0, 4),   // Wood wall top-left
  wall_wood_tr:  tt(1, 4),   // Wood wall top-right
  wall_wood_bl:  tt(2, 4),   // Wood wall bottom-left
  wall_wood_br:  tt(3, 4),   // Wood wall bottom-right
  door_wood:     tt(4, 4),   // Wooden door
  window_wood:   tt(5, 4),   // Wooden window
  wall_brick_tl: tt(6, 4),   // Brick wall top-left
  wall_brick_tr: tt(7, 4),   // Brick wall top-right
  pipe_joint:    tt(8, 4),   // Pipe junction
  pipe_end:      tt(9, 4),   // Pipe end cap
  pipe_vert:     tt(10, 4),  // Pipe vertical segment
  pipe_horiz:    tt(11, 4),  // Pipe horizontal segment

  // --- Row 5: Brick/Grey Walls + Signs ---
  wall_brick_bl: tt(0, 5),   // Brick wall bottom-left
  wall_brick_br: tt(1, 5),   // Brick wall bottom-right
  door_brick:    tt(2, 5),   // Brick door
  window_brick:  tt(3, 5),   // Brick window
  wall_grey_tl:  tt(4, 5),   // Grey wall top-left
  wall_grey_tr:  tt(5, 5),   // Grey wall top-right
  wall_grey_bl:  tt(6, 5),   // Grey wall bottom-left
  wall_grey_br:  tt(7, 5),   // Grey wall bottom-right
  sign_1:        tt(8, 5),   // Sign
  sign_2:        tt(9, 5),   // Sign variant
  coin:          tt(10, 5),  // Coin
  gem_town:      tt(11, 5),  // Gem/jewel

  // --- Row 6: Stone Walls + Props ---
  stone_tl:      tt(0, 6),   // Stone wall top-left
  stone_tr:      tt(1, 6),   // Stone wall top-right
  stone_bl:      tt(2, 6),   // Stone wall bottom-left
  stone_br:      tt(3, 6),   // Stone wall bottom-right
  stone_door:    tt(4, 6),   // Stone doorway
  stone_window:  tt(5, 6),   // Stone window
  crate:         tt(6, 6),   // Wooden crate
  barrel:        tt(7, 6),   // Barrel
  bread:         tt(8, 6),   // Bread loaf
  cheese:        tt(9, 6),   // Cheese wheel
  apple:         tt(10, 6),  // Apple
  target_board:  tt(11, 6),  // Target/bullseye

  // --- Row 7: Castle Walls + Gate ---
  castle_tl:     tt(0, 7),   // Castle wall top-left
  castle_tr:     tt(1, 7),   // Castle wall top-right
  castle_bl:     tt(2, 7),   // Castle wall bottom-left
  castle_br:     tt(3, 7),   // Castle wall bottom-right
  castle_gate_tl: tt(4, 7),  // Castle gate top-left
  castle_gate_tr: tt(5, 7),  // Castle gate top-right
  castle_gate_bl: tt(6, 7),  // Castle gate bottom-left
  castle_gate_br: tt(7, 7),  // Castle gate bottom-right
  key_icon:      tt(8, 7),   // Key item
  lantern:       tt(9, 7),   // Lantern
  mushroom:      tt(10, 7),  // Mushroom
  flag:          tt(11, 7),  // Flag

  // --- Row 8: Fortress + Tools ---
  fort_tl:       tt(0, 8),   // Fortress wall top-left
  fort_tr:       tt(1, 8),   // Fortress wall top-right
  fort_bl:       tt(2, 8),   // Fortress wall bottom-left
  fort_br:       tt(3, 8),   // Fortress wall bottom-right
  arch_tl:       tt(4, 8),   // Gate arch top-left
  arch_tr:       tt(5, 8),   // Gate arch top-right
  arch_bl:       tt(6, 8),   // Gate arch bottom-left
  arch_br:       tt(7, 8),   // Gate arch bottom-right
  well:          tt(8, 8),   // Well
  anvil:         tt(9, 8),   // Anvil
  axe:           tt(10, 8),  // Axe
  pickaxe:       tt(11, 8),  // Pickaxe

  // --- Row 9: Fences + Bridges + Tools ---
  fence_h:       tt(0, 9),   // Horizontal fence
  fence_v:       tt(1, 9),   // Vertical fence
  fence_corner:  tt(2, 9),   // Fence corner
  fence_end:     tt(3, 9),   // Fence end
  bridge_h:      tt(4, 9),   // Horizontal bridge
  bridge_v:      tt(5, 9),   // Vertical bridge
  bridge_end_l:  tt(6, 9),   // Bridge left end
  bridge_end_r:  tt(7, 9),   // Bridge right end
  hammer_town:   tt(8, 9),   // Hammer tool
  saw:           tt(9, 9),   // Saw tool
  shovel:        tt(10, 9),  // Shovel
  bucket:        tt(11, 9),  // Bucket

  // --- Row 10: Water + Signs + Weapons ---
  water_1:       tt(0, 10),  // Water tile
  water_2:       tt(1, 10),  // Water variant
  water_3:       tt(2, 10),  // Water variant
  water_4:       tt(3, 10),  // Water variant
  sign_post:     tt(4, 10),  // Signpost
  tombstone:     tt(5, 10),  // Tombstone
  cross_grave:   tt(6, 10),  // Cross grave marker
  stump:         tt(7, 10),  // Tree stump
  sword_town:    tt(8, 10),  // Sword
  shield_town:   tt(9, 10),  // Shield
  bow:           tt(10, 10), // Bow
  arrow_item:    tt(11, 10), // Arrow
} as const satisfies Record<string, SpriteRegion>

// ---------------------------------------------------------------------------
// Sprite Sheet Regions — Kenney Tiny Dungeon (192×176 tilemap_packed.png)
//
// Layout (12 cols × 11 rows):
//   Row 0:  Dungeon floor tiles, wall tops, wall decorations
//   Row 1:  Wall sides, wall bottoms, doors, wall corners/alternates
//   Row 2:  Floor details, stairs/ladders, water/lava/pits
//   Row 3:  Furniture (chests, barrels, tables, bookshelves, torch)
//   Row 4:  More furniture (cabinet, throne, pillars, cauldron, bones)
//   Row 5:  Traps & props (chains, webs, levers, crystals, runes)
//   Row 6:  Decorations (candles, lamps, rugs, altar, treasure)
//   Row 7:  Hero characters (knight, mage, rogue, ranger, etc.)
//   Row 8:  NPC characters (guard, wizard, blacksmith, etc.)
//   Row 9:  Monsters (slime, bat, skeleton, zombie, golem, dragon)
//   Row 10: Items (sword, axe, dagger, staff, shield, potion, scroll, key, gem)
// ---------------------------------------------------------------------------

export const TINY_DUNGEON_REGIONS = {
  // --- Row 0: Dungeon floors + wall tops ---
  floor_1:       td(0, 0),   // Stone floor
  floor_2:       td(1, 0),   // Stone floor variant
  floor_3:       td(2, 0),   // Darker floor
  floor_4:       td(3, 0),   // Floor variant
  wall_top_1:    td(4, 0),   // Wall top
  wall_top_2:    td(5, 0),   // Wall top variant
  wall_top_3:    td(6, 0),   // Wall top (decorated)
  wall_top_4:    td(7, 0),   // Wall top variant
  wall_deco_1:   td(8, 0),   // Wall decoration
  wall_deco_2:   td(9, 0),   // Wall decoration variant
  wall_deco_3:   td(10, 0),  // Wall shelf/items
  wall_deco_4:   td(11, 0),  // Wall decoration variant

  // --- Row 1: Wall sides + doors ---
  wall_side_1:   td(0, 1),   // Wall side left
  wall_side_2:   td(1, 1),   // Wall side right
  wall_bot_1:    td(2, 1),   // Wall bottom
  wall_bot_2:    td(3, 1),   // Wall bottom variant
  door_closed:   td(4, 1),   // Closed door
  door_open:     td(5, 1),   // Open door
  wall_corner_1: td(6, 1),   // Wall corner
  wall_corner_2: td(7, 1),   // Wall corner variant
  wall_alt_1:    td(8, 1),   // Alternate wall
  wall_alt_2:    td(9, 1),   // Alternate wall variant
  wall_alt_3:    td(10, 1),  // Alternate wall variant
  wall_alt_4:    td(11, 1),  // Alternate wall variant

  // --- Row 2: Floor details + stairs ---
  floor_detail_1: td(0, 2),  // Detailed floor
  floor_detail_2: td(1, 2),  // Detailed floor variant
  floor_detail_3: td(2, 2),  // Pattern floor
  floor_detail_4: td(3, 2),  // Pattern floor variant
  stairs_up:      td(4, 2),  // Stairs going up
  stairs_down:    td(5, 2),  // Stairs going down
  ladder:         td(6, 2),  // Ladder
  trapdoor:       td(7, 2),  // Trapdoor
  water_dung:     td(8, 2),  // Water/puddle
  lava:           td(9, 2),  // Lava
  pit:            td(10, 2), // Pit/hole
  crack:          td(11, 2), // Cracked floor

  // --- Row 3: Furniture ---
  chest_closed:  td(0, 3),   // Closed chest
  chest_open:    td(1, 3),   // Open chest
  crate_dung:    td(2, 3),   // Dungeon crate
  barrel_dung:   td(3, 3),   // Dungeon barrel
  table:         td(4, 3),   // Table
  chair:         td(5, 3),   // Chair
  bookshelf_1:   td(6, 3),   // Bookshelf
  bookshelf_2:   td(7, 3),   // Bookshelf variant
  bed:           td(8, 3),   // Bed
  banner_1:      td(9, 3),   // Banner/tapestry
  banner_2:      td(10, 3),  // Banner variant
  torch:         td(11, 3),  // Wall torch

  // --- Row 4: More furniture ---
  cabinet:       td(0, 4),   // Cabinet
  dresser:       td(1, 4),   // Dresser
  desk:          td(2, 4),   // Desk
  throne:        td(3, 4),   // Throne
  pillar_top:    td(4, 4),   // Pillar top
  pillar_mid:    td(5, 4),   // Pillar middle
  pillar_bot:    td(6, 4),   // Pillar bottom
  pot:           td(7, 4),   // Pot/vase
  cauldron:      td(8, 4),   // Cauldron
  sack:          td(9, 4),   // Sack/bag
  bones:         td(10, 4),  // Pile of bones
  skull:         td(11, 4),  // Skull

  // --- Row 5: Traps & props ---
  chains:        td(0, 5),   // Hanging chains
  web:           td(1, 5),   // Spider web
  spike_trap:    td(2, 5),   // Spike trap
  pressure_plate: td(3, 5),  // Pressure plate
  lever_off:     td(4, 5),   // Lever (off)
  lever_on:      td(5, 5),   // Lever (on)
  sign_dung:     td(6, 5),   // Dungeon sign
  grave:         td(7, 5),   // Grave
  mushroom_dung: td(8, 5),   // Mushroom
  crystal_1:     td(9, 5),   // Crystal
  crystal_2:     td(10, 5),  // Crystal variant
  rune:          td(11, 5),  // Rune/magic circle

  // --- Row 6: Decorations + treasure ---
  candle:        td(0, 6),   // Candle
  lamp:          td(1, 6),   // Lamp
  rug_1:         td(2, 6),   // Rug/carpet
  rug_2:         td(3, 6),   // Rug variant
  painting:      td(4, 6),   // Painting
  mirror:        td(5, 6),   // Mirror
  altar:         td(6, 6),   // Altar
  fountain:      td(7, 6),   // Fountain
  coin_pile:     td(8, 6),   // Pile of coins
  gem_pile:      td(9, 6),   // Pile of gems
  gold_bar:      td(10, 6),  // Gold bar
  treasure:      td(11, 6),  // Treasure chest (full)

  // --- Row 7: Hero characters ---
  hero_knight:   td(0, 7),   // Knight hero
  hero_mage:     td(1, 7),   // Mage hero
  hero_rogue:    td(2, 7),   // Rogue hero
  hero_ranger:   td(3, 7),   // Ranger hero
  hero_cleric:   td(4, 7),   // Cleric hero
  hero_barb:     td(5, 7),   // Barbarian hero
  npc_king:      td(6, 7),   // King NPC
  npc_queen:     td(7, 7),   // Queen NPC
  npc_merchant:  td(8, 7),   // Merchant NPC
  npc_villager_1: td(9, 7),  // Villager
  npc_villager_2: td(10, 7), // Villager variant
  npc_villager_3: td(11, 7), // Villager variant

  // --- Row 8: NPC characters ---
  npc_guard:     td(0, 8),   // Guard
  npc_wizard:    td(1, 8),   // Wizard
  npc_priest:    td(2, 8),   // Priest
  npc_bard:      td(3, 8),   // Bard
  npc_smith:     td(4, 8),   // Blacksmith
  npc_farmer:    td(5, 8),   // Farmer
  npc_child_1:   td(6, 8),   // Child
  npc_child_2:   td(7, 8),   // Child variant
  npc_elder:     td(8, 8),   // Elder
  npc_monk:      td(9, 8),   // Monk
  npc_thief:     td(10, 8),  // Thief
  npc_assassin:  td(11, 8),  // Assassin

  // --- Row 9: Monsters ---
  monster_slime:    td(0, 9),  // Green slime
  monster_bat:      td(1, 9),  // Bat
  monster_spider:   td(2, 9),  // Spider
  monster_rat:      td(3, 9),  // Rat
  monster_skeleton: td(4, 9),  // Skeleton
  monster_zombie:   td(5, 9),  // Zombie
  monster_ghost:    td(6, 9),  // Ghost
  monster_golem:    td(7, 9),  // Stone golem
  monster_demon:    td(8, 9),  // Demon
  monster_dragon:   td(9, 9),  // Dragon
  monster_boss_1:   td(10, 9), // Boss creature 1
  monster_boss_2:   td(11, 9), // Boss creature 2

  // --- Row 10: Items ---
  item_sword:    td(0, 10),  // Sword
  item_axe:      td(1, 10),  // Axe
  item_dagger:   td(2, 10),  // Dagger
  item_staff:    td(3, 10),  // Staff/wand
  item_bow:      td(4, 10),  // Bow
  item_shield:   td(5, 10),  // Shield
  item_helmet:   td(6, 10),  // Helmet
  item_armor:    td(7, 10),  // Armor/chestpiece
  item_potion:   td(8, 10),  // Potion bottle
  item_scroll:   td(9, 10),  // Scroll
  item_key:      td(10, 10), // Key
  item_gem:      td(11, 10), // Gem/jewel
} as const satisfies Record<string, SpriteRegion>

// ---------------------------------------------------------------------------
// Entity Sprite Mappings — MOVED to entity-sprite-map.ts
// ---------------------------------------------------------------------------
// AGENT_SPRITE_MAP, AGENT_SPRITE_POOL, TOOL_SPRITE_MAP, MONSTER_SPRITE_MAP
// have been removed. All entity→sprite resolution now goes through
// entitySprites from './entity-sprite-map' with user-editable JSON config.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Connection Type → Road Style Mapping
// Maps district connection types to road tile keys and colors.
// ---------------------------------------------------------------------------

export const CONNECTION_ROAD_STYLES: Record<string, {
  tileKey: string;
  borderColor: number;
  label: string;
}> = {
  api:        { tileKey: 'cobble_1', borderColor: 0x3498db, label: 'API' },
  import:     { tileKey: 'path_2',   borderColor: 0x9b59b6, label: 'Import' },
  data_flow:  { tileKey: 'cobble_3', borderColor: 0x2ecc71, label: 'Data' },
  event:      { tileKey: 'path_3',   borderColor: 0xe67e22, label: 'Event' },
  dependency: { tileKey: 'path_1',   borderColor: 0x95a5a6, label: 'Dep' },
  general:    { tileKey: 'path_1',   borderColor: 0x7f8c8d, label: '' },
}

// ---------------------------------------------------------------------------
// Biome → District Wall Tile Mapping
// Maps each biome to wall tile keys used for the town wall perimeter.
// Keys: h = horizontal wall segment, v = vertical wall segment,
//       tl/tr/bl/br = corners, gate = gate/entrance tile
// ---------------------------------------------------------------------------

export const BIOME_WALL_TILES: Record<string, {
  h: string; v: string;
  tl: string; tr: string; bl: string; br: string;
  gate: string;
}> = {
  urban:       { h: 'wall_brick_tl', v: 'wall_brick_tr', tl: 'wall_brick_tl', tr: 'wall_brick_tr', bl: 'wall_brick_bl', br: 'wall_brick_br', gate: 'door_brick' },
  library:     { h: 'wall_wood_tl',  v: 'wall_wood_tr',  tl: 'wall_wood_tl',  tr: 'wall_wood_tr',  bl: 'wall_wood_bl',  br: 'wall_wood_br',  gate: 'door_wood' },
  industrial:  { h: 'stone_tl',      v: 'stone_tr',      tl: 'stone_tl',      tr: 'stone_tr',      bl: 'stone_bl',      br: 'stone_br',      gate: 'stone_door' },
  observatory: { h: 'wall_grey_tl',  v: 'wall_grey_tr',  tl: 'wall_grey_tl',  tr: 'wall_grey_tr',  bl: 'wall_grey_bl',  br: 'wall_grey_br',  gate: 'stone_door' },
  arts:        { h: 'wall_brick_tl', v: 'wall_brick_tr', tl: 'wall_brick_tl', tr: 'wall_brick_tr', bl: 'wall_brick_bl', br: 'wall_brick_br', gate: 'door_brick' },
  harbor:      { h: 'wall_wood_tl',  v: 'wall_wood_tr',  tl: 'wall_wood_tl',  tr: 'wall_wood_tr',  bl: 'wall_wood_bl',  br: 'wall_wood_br',  gate: 'door_wood' },
  civic:       { h: 'castle_tl',     v: 'castle_tr',     tl: 'castle_tl',     tr: 'castle_tr',     bl: 'castle_bl',     br: 'castle_br',     gate: 'castle_gate_tl' },
}

// ---------------------------------------------------------------------------
// Biome → Building Sprite Mapping
// Maps each biome to an array of Tiny Town building region keys to use
// as building texture variants for that biome.
// ---------------------------------------------------------------------------

export const BIOME_BUILDING_SPRITES: Record<string, string[]> = {
  urban: ['wall_brick_tl', 'wall_brick_tr', 'wall_grey_tl', 'wall_grey_tr'],
  library: ['wall_wood_tl', 'wall_wood_tr', 'wall_brown_1', 'wall_brown_2'],
  industrial: ['stone_tl', 'stone_tr', 'pipe_joint', 'pipe_end'],
  observatory: ['wall_grey_tl', 'wall_grey_tr', 'wall_grey_bl', 'wall_grey_br'],
  arts: ['wall_brick_tl', 'wall_wood_tl', 'roof_red_tl', 'roof_blue_tl'],
  harbor: ['wall_wood_bl', 'wall_wood_br', 'bridge_h', 'bridge_v'],
  civic: ['castle_tl', 'castle_tr', 'stone_tl', 'stone_tr'],
}

// ---------------------------------------------------------------------------
// Biome → Ground Tile Sprite Mapping
// Maps biome ground tile type names to Tiny Town region keys.
// ---------------------------------------------------------------------------

export const BIOME_GROUND_SPRITES: Record<string, Record<string, string>> = {
  urban: {
    road: 'path_1',
    sidewalk: 'cobble_1',
    circuit: 'path_3',
    grass_patch: 'grass_1',
  },
  library: {
    cobblestone: 'cobble_2',
    hedge: 'bush_1',
    carpet: 'path_2',
    wood_floor: 'wall_wood_bl',
  },
  industrial: {
    rail: 'pipe_h',
    pipe_grate: 'pipe_v',
    metal_floor: 'stone_bl',
    gravel: 'rock',
  },
  observatory: {
    mountain_path: 'path_4',
    stone: 'cobble_3',
    snow: 'grass_2',
    glass_floor: 'cobble_4',
  },
  arts: {
    mosaic_warm: 'path_1',
    mosaic_cool: 'path_2',
    paint_splat: 'grass_flower',
    tile_pastel: 'path_3',
  },
  harbor: {
    dock_wood: 'bridge_h',
    water_shallow: 'water_1',
    sand: 'sand',
    rope_bridge: 'bridge_v',
  },
  civic: {
    plaza_stone: 'cobble_1',
    brick_wide: 'cobble_2',
    garden: 'grass_flower',
    fountain_edge: 'cobble_3',
  },
}

// ---------------------------------------------------------------------------
// Tile State → Sprite Mapping
// ---------------------------------------------------------------------------

export const TILE_STATE_SPRITES: Record<string, string> = {
  scaffolding: 'crate',         // Scaffolding → wooden crate look
  building: 'wall_wood_tl',     // In-progress → wood wall
  complete: 'cobble_1',         // Complete → clean cobblestone
  ruins: 'crack',               // Ruins → cracked floor (from dungeon)
}

// ---------------------------------------------------------------------------
// Work Item Status → Icon Asset Path Mapping
// ---------------------------------------------------------------------------

export const WORKITEM_ICON_PATHS: Record<string, string> = {
  queued: ASSET_PATHS.ICON_EXCLAMATION,
  active: ASSET_PATHS.ICON_TARGET,
  blocked: ASSET_PATHS.ICON_LOCKED,
  done: ASSET_PATHS.ICON_CHECKMARK,
}

// ---------------------------------------------------------------------------
// Particle Name → Asset Path Mapping
// ---------------------------------------------------------------------------

export const PARTICLE_PATHS: Record<string, string> = {
  circle: ASSET_PATHS.PARTICLE_CIRCLE,
  spark: ASSET_PATHS.PARTICLE_SPARK,
  smoke: ASSET_PATHS.PARTICLE_SMOKE,
  trail: ASSET_PATHS.PARTICLE_TRAIL,
  fire: ASSET_PATHS.PARTICLE_FIRE,
  flame: ASSET_PATHS.PARTICLE_FLAME,
  magic: ASSET_PATHS.PARTICLE_MAGIC,
  star: ASSET_PATHS.PARTICLE_STAR,
  flare: ASSET_PATHS.PARTICLE_FLARE,
  slash: ASSET_PATHS.PARTICLE_SLASH,
}
