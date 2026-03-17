// ============================================================================
// Monster Inspection Panel — Context-aware side panel for error/incident
// details. Sections are shown only when supporting data exists.
// ============================================================================

import { useState } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useMonsterStore } from '../stores/monsterStore'
import { useUniverseStore } from '../stores/universeStore'
import { useAgentStore } from '../stores/agentStore'
import { useWorkItemStore } from '../stores/workItemStore'
import { SpriteIcon } from './SpriteIcon'
import { ResizableSidePanel } from './ResizableSidePanel'
import { entitySprites } from '../engine/entity-sprite-map'
import { Button } from '@multiverse/ui'
import {
  classifyError,
  computeVisibility,
  significanceLabel,
  scopeLabel,
  statusLabel,
  estimatedResolution,
  formatTimestamp,
  deriveErrorName,
  isStale,
  isOutputUseful,
} from './monster-panel-vm'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEVERITY_COLORS: Record<string, string> = {
  warning: 'text-yellow-400',
  error: 'text-red-400',
  critical: 'text-red-500',
  outage: 'text-red-600',
}

const SEVERITY_BG: Record<string, string> = {
  warning: 'bg-yellow-400/10 text-yellow-400 border border-yellow-400/20',
  error: 'bg-red-400/10 text-red-400 border border-red-400/20',
  critical: 'bg-red-500/10 text-red-500 border border-red-500/20',
  outage: 'bg-red-600/10 text-red-600 border border-red-600/20',
}

// ---------------------------------------------------------------------------
// Tiny reusable bits
// ---------------------------------------------------------------------------

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1">
      {children}
    </span>
  )
}

function Divider() {
  return <div className="border-t border-border/50 my-3" />
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MonsterPanel() {
  const selectedId = useUIStore((s) => s.selectedEntityId)
  const selectedType = useUIStore((s) => s.selectedEntityType)
  const clearSelection = useUIStore((s) => s.clearSelection)
  const monsters = useMonsterStore((s) => s.monsters)
  const buildings = useUniverseStore((s) => s.buildings)
  const allAgents = useAgentStore((s) => s.agents)
  const workItems = useWorkItemStore((s) => s.workItems)

  const [debugOpen, setDebugOpen] = useState(false)

  if (selectedType !== 'monster' || !selectedId) return null

  const monster = monsters.get(selectedId)
  if (!monster) return null

  // ── Linked entities ──
  const linkedBuilding = monster.affected_building_id
    ? buildings.get(monster.affected_building_id)
    : undefined
  const linkedWorkItem = monster.workitem_id
    ? workItems.get(monster.workitem_id)
    : undefined
  const fightingAgent = monster.fighting_agent_id
    ? allAgents.get(monster.fighting_agent_id)
    : undefined

  // ── Derived state ──
  const classification = classifyError(monster, linkedBuilding, linkedWorkItem)
  const vis = computeVisibility(monster, classification, linkedBuilding, linkedWorkItem)
  const spriteKey = entitySprites.resolveEventVariant('error', monster.severity, monster.id)
  const severityColor = SEVERITY_COLORS[monster.severity] ?? 'text-muted-foreground'
  const isIncident = classification === 'incident'

  // Error naming: codename for title, descriptor for context
  const errorName = deriveErrorName(monster.error_details, monster.severity, monster.id)
  const title = isIncident ? 'Incident' : errorName.codename
  const descriptor = errorName.descriptor

  // Output section: show descriptor always, raw output only if meaningfully different
  const rawMessage = monster.error_details?.message ?? ''
  const toolName = monster.error_details?.tool_name ?? ''
  const hasUsefulOutput = isOutputUseful(rawMessage, {
    toolName,
    codename: errorName.codename,
    descriptor,
  })

  const now = Date.now()
  const openMs = monster.resolved_at
    ? monster.resolved_at - monster.spawned_at
    : now - monster.spawned_at
  const stale = isStale(openMs) && !monster.resolved_at

  return (
    <ResizableSidePanel>
      <div className="p-4 flex flex-col gap-0">

        {/* ━━ Header ━━ */}
        <div className="flex items-center gap-2 w-full">
          <SpriteIcon region={spriteKey} size={28} className="shrink-0" />
          <h2
            className={`font-pixel text-sm leading-tight ${severityColor} truncate flex-1 min-w-0`}
            style={{ maxWidth: 'calc(100% - 70px)' }}
            title={title}
          >
            {title}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={clearSelection}
            className="h-6 w-6 text-base leading-none text-muted-foreground hover:bg-accent hover:text-accent-foreground shrink-0 ml-auto"
            aria-label="Close panel"
          >
            &times;
          </Button>
        </div>

        {/* Badges — spacing below title, above badges */}
        <div className="flex items-center gap-1.5 mt-2 mb-3 flex-wrap">
          <span className={`text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded-sm ${SEVERITY_BG[monster.severity] ?? 'bg-muted/50 text-muted-foreground'}`}>
            {statusLabel(monster.status)}
          </span>
          {!isIncident && (
            <span className="text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded-sm bg-green-500/10 text-green-400 border border-green-500/20">
              No user impact
            </span>
          )}
          {stale && (
            <span className="text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded-sm text-yellow-500/80 bg-yellow-500/10 border border-yellow-500/20">
              Stale
            </span>
          )}
        </div>

        {/* ━━ Error Output: descriptor + raw output if useful ━━ */}
        <Divider />
        <div className="mb-3">
          <Label>Error Output</Label>

          {/* Name: always show the descriptor (technical context) */}
          <p className="text-xs text-card-foreground mb-1">
            {descriptor}
          </p>

          {/* Raw output: only if meaningfully different from name/tool/codename */}
          {hasUsefulOutput && (
            <code className="block text-[11px] text-muted-foreground font-mono bg-muted/30 rounded px-2.5 py-2 break-words leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto mt-1">
              {rawMessage}
            </code>
          )}
        </div>

        {/* ━━ Impact (conditional) ━━ */}
        {vis.showImpact && (
          <>
            <Divider />
            <div className="mb-1">
              <Label>Impact</Label>
              <p className="text-xs text-card-foreground">
                {scopeLabel(classification, monster, linkedBuilding)}
              </p>
            </div>

            {isIncident && (
              <div className="mt-1 mb-1">
                <span className="text-[10px] text-muted-foreground">Significance: </span>
                <span className={`text-[10px] ${severityColor}`}>
                  {significanceLabel(monster.severity)}
                </span>
              </div>
            )}

            {vis.showAffectedBuilding && linkedBuilding && (
              <div className="mt-1">
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto max-w-full justify-start truncate p-0 text-[11px] text-blue-400 hover:text-blue-300"
                  onClick={() => useUIStore.getState().selectEntity(linkedBuilding.id, 'building')}
                >
                  <code className="bg-muted/40 px-1 rounded text-[10px]">{linkedBuilding.name}</code>
                </Button>
              </div>
            )}

            {vis.showAffectedWorkItem && linkedWorkItem && (
              <div className="mt-1">
                <span className="text-[10px] text-muted-foreground">Work: </span>
                <span className="text-[11px] text-card-foreground">{linkedWorkItem.title}</span>
              </div>
            )}

            {vis.showAffectedTiles && (
              <div className="mt-1">
                <span className="text-[10px] text-muted-foreground">Files affected: </span>
                <span className="text-[11px] text-card-foreground">{monster.affected_tiles.length}</span>
              </div>
            )}
          </>
        )}

        {/* ━━ Time To Resolution ━━ */}
        <Divider />
        <div className="mb-1">
          <Label>Time To Resolution</Label>
          <span className="font-pixel text-[11px] text-card-foreground">
            {estimatedResolution(monster.severity)}
          </span>
        </div>

        {/* Health bar — incidents / in_combat only */}
        {vis.showHealth && (
          <div className="mt-2 mb-1">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-muted/50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-red-500/80 rounded-full transition-all"
                  style={{ width: `${monster.health}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground tabular-nums">{monster.health}%</span>
            </div>
          </div>
        )}

        {/* ━━ Timeline (incidents / resolved) ━━ */}
        {vis.showTimeline && (
          <>
            <Divider />
            <Label>Timeline</Label>
            <div className="flex flex-wrap gap-x-5 gap-y-0.5 text-[11px] text-card-foreground">
              <span>
                <span className="text-muted-foreground">Spawned </span>
                {formatTimestamp(monster.spawned_at)}
              </span>
              {vis.showResolvedAt && monster.resolved_at && (
                <span>
                  <span className="text-muted-foreground">Resolved </span>
                  <span className="text-green-400">{formatTimestamp(monster.resolved_at)}</span>
                </span>
              )}
            </div>
          </>
        )}

        {/* ━━ Debug (collapsible) ━━ */}
        {vis.showDebug && (
          <>
            <Divider />
            <button
              type="button"
              className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-card-foreground transition-colors w-full text-left py-0.5"
              onClick={() => setDebugOpen(!debugOpen)}
            >
              <span className="text-[8px] transition-transform" style={{ transform: debugOpen ? 'rotate(90deg)' : undefined }}>
                ▶
              </span>
              Debug data
            </button>

            {debugOpen && (
              <div className="mt-2 space-y-2">
                {vis.showStackTrace && (
                  <pre className="text-[9px] text-muted-foreground bg-muted/20 rounded px-2 py-1.5 overflow-x-auto max-h-28 font-mono leading-relaxed whitespace-pre-wrap break-all">
                    {monster.error_details.stack_trace}
                  </pre>
                )}
                {vis.showLogs && monster.error_details.logs && (
                  <div className="space-y-0.5 max-h-28 overflow-y-auto">
                    {monster.error_details.logs.map((log) => (
                      <p key={log} className="text-[9px] text-muted-foreground font-mono bg-muted/15 rounded px-2 py-0.5 truncate">
                        {log}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ━━ Footer actions ━━ */}
        {(fightingAgent || linkedBuilding) && (
          <div className="mt-auto pt-3">
            <Divider />
            <div className="flex gap-2">
              {fightingAgent && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[10px] text-muted-foreground hover:text-card-foreground px-2"
                  onClick={() => useUIStore.getState().selectEntity(fightingAgent.id, 'agent')}
                >
                  Open agent
                </Button>
              )}
              {linkedBuilding && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[10px] text-muted-foreground hover:text-card-foreground px-2"
                  onClick={() => useUIStore.getState().selectEntity(linkedBuilding.id, 'building')}
                >
                  Open building
                </Button>
              )}
            </div>
          </div>
        )}

      </div>
    </ResizableSidePanel>
  )
}
