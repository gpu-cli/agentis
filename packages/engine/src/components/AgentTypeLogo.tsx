// ============================================================================
// Agent Type Logo — AI provider logo from PNG asset
// Extracted to avoid circular dependency between AgentPanel ↔ AgentChatPanel
// ============================================================================

export const AGENT_TYPE_META: Record<string, { label: string; logo: string; invert?: boolean }> = {
  claude: { label: 'Claude (Anthropic)', logo: '/assets/logos/claude.png' },
  cursor: { label: 'Cursor', logo: '/assets/logos/cursor.png' },
  codex: { label: 'Codex (OpenAI)', logo: '/assets/logos/codex.png', invert: true },
  gemini: { label: 'Gemini (Google)', logo: '/assets/logos/gemini.png' },
  copilot: { label: 'GitHub Copilot', logo: '/assets/logos/copilot.png', invert: true },
  grok: { label: 'Grok (xAI)', logo: '/assets/logos/grok.png', invert: true },
  'open-claw': { label: 'Open Claw', logo: '/assets/logos/open-claw.png' },
}

/** AI provider logo from PNG asset */
export function AgentTypeLogo({ type, size = 20 }: { type: string; size?: number }) {
  const meta = AGENT_TYPE_META[type]

  if (meta) {
    return (
      <img
        src={meta.logo}
        alt={meta.label}
        width={size}
        height={size}
        className={`rounded-sm object-contain ${meta.invert ? 'brightness-0 invert' : ''}`}
        draggable={false}
      />
    )
  }

  // Fallback — circle with first letter for unknown types
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="#888" />
      <text x="12" y="16" textAnchor="middle" fill="white" fontSize="10" fontFamily="sans-serif">
        {(type[0] ?? '?').toUpperCase()}
      </text>
    </svg>
  )
}
