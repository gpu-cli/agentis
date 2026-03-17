// ============================================================================
// Resizable Side Panel — Wrapper that adds a left-edge drag handle to
// right-anchored side panels (Agent, Building, District).
//
// Usage:
//   <ResizableSidePanel>
//     <div className="p-4">...content...</div>
//   </ResizableSidePanel>
//
// The panel defaults to 320px (w-80) and can be dragged wider up to 600px,
// or narrower down to 256px.
// ============================================================================

import { useCallback, useRef, useState, type ReactNode } from 'react'
import { ScrollArea } from '@multiverse/ui'

const MIN_WIDTH = 256
const DEFAULT_WIDTH = 320
const MAX_WIDTH = 600

interface ResizableSidePanelProps {
  children: ReactNode
  /** Extra className applied to the outer container */
  className?: string
}

export function ResizableSidePanel({ children, className }: ResizableSidePanelProps) {
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const dragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(DEFAULT_WIDTH)

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragging.current = true
      startX.current = e.clientX
      startWidth.current = width

      const target = e.currentTarget as HTMLElement
      target.setPointerCapture(e.pointerId)
    },
    [width],
  )

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    // Dragging left = increase width, dragging right = decrease width
    const delta = startX.current - e.clientX
    const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta))
    setWidth(newWidth)
  }, [])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragging.current = false
    const target = e.currentTarget as HTMLElement
    target.releasePointerCapture(e.pointerId)
  }, [])

  return (
    <div
      className={`absolute inset-y-0 right-0 max-h-full bg-surface-2/95 backdrop-blur-sm border-l border-border z-30 flex flex-col overflow-hidden ${className ?? ''}`}
      style={{ width }}
    >
      {/* Drag handle — left edge rail (full height hit target) + visible centered grip */}
      <div
        className="absolute top-0 left-0 w-3 h-full cursor-col-resize z-10 group"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {/* Visible grip pill — centered vertically on the left edge */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-8 rounded-full bg-border group-hover:bg-muted-foreground/60 transition-colors" />
      </div>

      <ScrollArea className="flex-1 min-h-0" type="auto">
        <div className="overflow-x-hidden">
          {children}
        </div>
      </ScrollArea>
    </div>
  )
}
