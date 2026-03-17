// ============================================================================
// Event Log — Semi-transparent scrollable event log overlay (top-right)
// Shows building/district/island/world events with category filters.
// Uses Radix ScrollArea for invisible native-feel scrolling.
// ============================================================================

import { useState, useRef, useEffect, useMemo } from 'react'
import { useEventStore, classifyEvent, describeEvent, getErrorDetail, getToolDetail, EVENT_CATEGORY_ICONS, EVENT_CATEGORY_LABELS, EVENT_TYPE_ICONS } from '../stores/eventStore'
import type { WorldEventCategory } from '../stores/eventStore'
import { useAgentStore } from '../stores/agentStore'
import { useUniverseStore } from '../stores/universeStore'

import { Button, ScrollArea, ScrollBar } from '@multiverse/ui'

const ALL_CATEGORIES: WorldEventCategory[] = [
  'error', 'deployment', 'file_change', 'task', 'comms', 'combat',
]

type IslandsMap = ReturnType<typeof useUniverseStore.getState>['islands']
type DistrictsMap = ReturnType<typeof useUniverseStore.getState>['districts']
type BuildingsMap = ReturnType<typeof useUniverseStore.getState>['buildings']

/** Format a timestamp as relative time */
function relativeTime(processedAt: number): string {
  const seconds = Math.floor((Date.now() - processedAt) / 1000)
  if (seconds < 5) return 'now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.floor(minutes / 60)}h ago`
}

/** Resolve event location to a readable breadcrumb */
function resolveEventLocation(
  event: { target?: { building_id?: string; district_id?: string; island_id?: string } },
  islands: IslandsMap,
  districts: DistrictsMap,
  buildings: BuildingsMap,
): string {
  const parts: string[] = []

  if (event.target?.building_id) {
    const building = buildings.get(event.target.building_id)
    if (building) {
      const segments = building.name.split('/')
      parts.push(segments[segments.length - 1] ?? building.name)
    }
  }
  if (event.target?.district_id) {
    const district = districts.get(event.target.district_id)
    if (district) parts.unshift(district.name)
  }
  if (event.target?.island_id) {
    const island = islands.get(event.target.island_id)
    if (island) parts.unshift(island.name)
  }

  // If we only got a building, try to find its district/island
  if (parts.length <= 1 && event.target?.building_id) {
    const building = buildings.get(event.target.building_id)
    if (building) {
      for (const district of districts.values()) {
        if (building.district_id === district.id) {
          parts.unshift(district.name)
          for (const island of islands.values()) {
            if (district.island_id === island.id) {
              parts.unshift(island.name)
              break
            }
          }
          break
        }
      }
    }
  }

  return parts.length > 0 ? parts.join(' > ') : ''
}

export function EventLog() {
  const [collapsed, setCollapsed] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const eventLog = useEventStore((s) => s.eventLog)
  const eventFilters = useEventStore((s) => s.eventFilters)
  const toggleFilter = useEventStore((s) => s.toggleEventFilter)
  const agents = useAgentStore((s) => s.agents)
  const islands = useUniverseStore((s) => s.islands)
  const districts = useUniverseStore((s) => s.districts)
  const buildings = useUniverseStore((s) => s.buildings)

  // Derive filtered world events in-component to avoid creating new arrays
  // inside the Zustand selector (which causes infinite re-render loops).
  const filteredEvents = useMemo(() => {
    return eventLog.filter((log) => {
      const category = classifyEvent(log.event)
      return category !== null && eventFilters.has(category)
    })
  }, [eventLog, eventFilters])

  // Limit DOM rendering to the last 50 events — only ~30 are visible at once
  const displayEvents = filteredEvents.slice(-50)

  // Auto-scroll to bottom when new events arrive.
  // scrollRef is on the ScrollArea root — find the Radix viewport for scrolling.
  const prevCountRef = useRef(displayEvents.length)
  useEffect(() => {
    if (displayEvents.length > prevCountRef.current && scrollRef.current) {
      const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]')
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight
      }
    }
    prevCountRef.current = displayEvents.length
  }, [displayEvents.length])

  return (
    <div
      className="absolute top-2 left-2 w-72 z-20 transition-all duration-200"
    >
      {/* Header */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setCollapsed(!collapsed)}
        className={`h-auto w-full justify-between border border-border/50 bg-surface-2/95 px-3 py-2 backdrop-blur-sm hover:bg-accent/80 ${collapsed ? 'rounded-lg' : 'rounded-t-lg'}`}
      >
        <div className="flex items-center gap-2">
          <span className="font-pixel text-[10px] text-card-foreground">Event Log</span>
          <span className="text-[9px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
            {filteredEvents.length}
          </span>
        </div>
        <span className="text-muted-foreground text-xs">
          {collapsed ? '▼' : '▲'}
        </span>
      </Button>

      {!collapsed && (
        <div className="bg-surface-2/95 backdrop-blur-sm border border-t-0 border-border/50 rounded-b-lg overflow-hidden">
          {/* Filter pills — horizontal scroll, no visible scrollbar */}
          <ScrollArea className="w-full border-b border-border/30">
            <div className="flex flex-nowrap gap-1 px-2 py-1.5">
              {ALL_CATEGORIES.map((cat) => {
                const active = eventFilters.has(cat)
                return (
                  <Button
                    variant="ghost"
                    size="sm"
                    key={cat}
                    onClick={() => toggleFilter(cat)}
                    className={`h-5 shrink-0 px-1.5 text-[9px] ${
                      active
                        ? 'bg-muted text-card-foreground'
                        : 'bg-card/50 text-muted-foreground/60'
                    }`}
                  >
                    {EVENT_CATEGORY_ICONS[cat]} {EVENT_CATEGORY_LABELS[cat]}
                  </Button>
                )
              })}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>

          {/* Event list — vertical scroll via ShadCN ScrollArea */}
          <ScrollArea ref={scrollRef} viewportClassName="max-h-[60vh]">
            {displayEvents.length === 0 && (
              <p className="text-[10px] text-muted-foreground/60 italic px-3 py-3 text-center">
                No events yet
              </p>
            )}
            {displayEvents.map((log) => {
              const category = classifyEvent(log.event)
              const description = describeEvent(log.event)
              const location = resolveEventLocation(log.event, islands, districts, buildings)
              const errorDetail = getErrorDetail(log.event)
              const toolDetail = getToolDetail(log.event)
              const agent = agents.get(log.event.agent_id)
              const icon = EVENT_TYPE_ICONS[log.event.type] ?? (category ? EVENT_CATEGORY_ICONS[category] : '📌')

              return (
                <div
                  key={log.event.id}
                  className="px-2.5 py-1.5 border-b border-border/50 hover:bg-accent/40 transition-colors"
                >
                  <div className="flex items-start gap-1.5">
                    <span className="text-[10px] shrink-0 mt-0.5">{icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-card-foreground leading-tight truncate" title={description}>
                        {description}
                      </p>
                      {errorDetail && (
                        <p className="text-[9px] text-red-400/80 leading-tight truncate mt-0.5" title={errorDetail}>
                          {errorDetail}
                        </p>
                      )}
                      {toolDetail && (
                        <p className="text-[9px] text-muted-foreground font-mono leading-tight truncate mt-0.5" title={toolDetail}>
                          {toolDetail}
                        </p>
                      )}
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {agent && (
                          <span className="text-[9px] text-green-400">
                            [{agent.name}]
                          </span>
                        )}
                        {location && (
                          <span className="text-[9px] text-muted-foreground truncate" title={location}>
                            {location}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[9px] text-muted-foreground/60 shrink-0 mt-0.5">
                      {relativeTime(log.processedAt)}
                    </span>
                  </div>
                </div>
              )
            })}
          </ScrollArea>
        </div>
      )}
    </div>
  )
}
