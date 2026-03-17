// ============================================================================
// WarningsBanner — Expandable warning list shown after import
// ============================================================================

import { useState } from 'react'
import { Button } from '@multiverse/ui'

export function WarningsBanner({ warnings, onDismiss }: { warnings: string[]; onDismiss: () => void }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="bg-yellow-900/50 border-b border-yellow-700/50 px-4 py-2 shrink-0">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className="h-6 gap-2 px-2 text-xs text-yellow-200 hover:text-yellow-100"
        >
          <span>{expanded ? '▼' : '▶'}</span>
          <span>{warnings.length} warning(s) during import</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          className="ml-4 h-6 px-2 text-xs text-yellow-400 hover:text-yellow-200"
        >
          Dismiss
        </Button>
      </div>
      {expanded && (
        <div className="mt-2 max-h-32 overflow-auto bg-yellow-950/40 rounded p-2 space-y-1">
          {warnings.map((w) => (
            <div key={w} className="text-[10px] font-mono text-yellow-300/80">{w}</div>
          ))}
        </div>
      )}
    </div>
  )
}
