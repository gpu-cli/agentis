// ============================================================================
// Multiverse — Tool Definitions
// From: planning/ui-plans/ui-roadmap.md §5 Tools & Inventory System
// ============================================================================

export type ToolCategory =
  | 'communication'
  | 'development'
  | 'research'
  | 'operations'
  | 'custom'

export interface ToolDefinition {
  id: string
  key: string
  label: string
  provider?: string
  icon_sprite: string
  use_animation: string
  category: ToolCategory
  is_custom: boolean
}

export interface OrgToolConfig {
  universe_id: string
  defaults: Record<
    string,
    {
      enabled: boolean
      provider?: string
      icon_sprite: string
      use_animation: string
      label: string
    }
  >
  agent_overrides: Record<
    string,
    Record<
      string,
      {
        enabled?: boolean
        icon_sprite?: string
        label?: string
      }
    >
  >
}

// ---------------------------------------------------------------------------
// Default Tool Mappings (from §5.2)
// ---------------------------------------------------------------------------

export const DEFAULT_TOOLS: Record<string, ToolDefinition> = {
  email: {
    id: 'tool_email',
    key: 'email',
    label: 'Email',
    provider: 'gmail',
    icon_sprite: 'paper_airplane',
    use_animation: 'throw_airplane',
    category: 'communication',
    is_custom: false,
  },
  code_edit: {
    id: 'tool_code_edit',
    key: 'code_edit',
    label: 'Code',
    provider: 'github',
    icon_sprite: 'hammer',
    use_animation: 'hammering',
    category: 'development',
    is_custom: false,
  },
  web_search: {
    id: 'tool_web_search',
    key: 'web_search',
    label: 'Search',
    icon_sprite: 'magnifying_glass',
    use_animation: 'search_radiate',
    category: 'research',
    is_custom: false,
  },
  slack: {
    id: 'tool_slack',
    key: 'slack',
    label: 'Slack',
    provider: 'slack',
    icon_sprite: 'megaphone',
    use_animation: 'broadcast',
    category: 'communication',
    is_custom: false,
  },
  file_read: {
    id: 'tool_file_read',
    key: 'file_read',
    label: 'Read',
    icon_sprite: 'book',
    use_animation: 'reading',
    category: 'research',
    is_custom: false,
  },
  git: {
    id: 'tool_git',
    key: 'git',
    label: 'Git',
    icon_sprite: 'scroll',
    use_animation: 'unfurl_scroll',
    category: 'development',
    is_custom: false,
  },
  deploy: {
    id: 'tool_deploy',
    key: 'deploy',
    label: 'Deploy',
    icon_sprite: 'rocket',
    use_animation: 'rocket_launch',
    category: 'operations',
    is_custom: false,
  },
  database: {
    id: 'tool_database',
    key: 'database',
    label: 'Database',
    icon_sprite: 'crystal_ball',
    use_animation: 'crystal_gaze',
    category: 'development',
    is_custom: false,
  },
  api_call: {
    id: 'tool_api_call',
    key: 'api_call',
    label: 'API',
    icon_sprite: 'wand',
    use_animation: 'wand_bolt',
    category: 'development',
    is_custom: false,
  },
  testing: {
    id: 'tool_testing',
    key: 'testing',
    label: 'Tests',
    icon_sprite: 'shield',
    use_animation: 'shield_test',
    category: 'development',
    is_custom: false,
  },
  documentation: {
    id: 'tool_documentation',
    key: 'documentation',
    label: 'Docs',
    icon_sprite: 'quill',
    use_animation: 'quill_write',
    category: 'development',
    is_custom: false,
  },
  image_gen: {
    id: 'tool_image_gen',
    key: 'image_gen',
    label: 'Image',
    icon_sprite: 'paintbrush',
    use_animation: 'paint_splash',
    category: 'custom',
    is_custom: false,
  },
  terminal: {
    id: 'tool_terminal',
    key: 'terminal',
    label: 'Terminal',
    icon_sprite: 'scroll_runes',
    use_animation: 'rune_float',
    category: 'development',
    is_custom: false,
  },
}
