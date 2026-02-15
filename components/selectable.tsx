"use client"

import * as React from "react"
import { cn, getSelectableRingClasses } from "@/lib/utils"

/** Base styles shared by all selectable elements (item cards, box cards). */
const SELECTABLE_BASE_CLASS = "rounded-lg cursor-pointer hover:shadow-lg transition-shadow"

export interface SelectableProps extends React.HTMLAttributes<HTMLDivElement> {
  /** When true, show full selection ring (selected or drop target). */
  selected?: boolean
  /** When true, show lighter hover ring when not selected. */
  selectionMode?: boolean
  /** When true, treat as selected for ring (e.g. drop target). */
  isOver?: boolean
}

/**
 * Wrapper for selectable elements (item cards, box cards). Centralizes selection ring logic:
 * full ring when selected or isOver, lighter theme ring on hover when in selection mode.
 */
const Selectable = React.forwardRef<HTMLDivElement, SelectableProps>(
  ({ selected = false, selectionMode = false, isOver = false, className, children, ...props }, ref) => {
    const showFullRing = selected || isOver
    return (
      <div
        ref={ref}
        className={cn(
          SELECTABLE_BASE_CLASS,
          getSelectableRingClasses(showFullRing, selectionMode),
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)
Selectable.displayName = "Selectable"

export { Selectable }
