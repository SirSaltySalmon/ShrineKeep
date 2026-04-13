"use client"

import * as React from "react"
import { cn, getSelectableRingClasses } from "@/lib/utils"

/**
 * Hover lift + shadow used by item/box cards. Pair with cursor-pointer (Selectable) or
 * cursor-default (read-only public cards).
 */
export const CARD_HOVER_MOTION_CLASS =
  "rounded-lg shadow-none transition-[transform,box-shadow] duration-300 ease-out motion-reduce:hover:transform-none motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-lg"

const SELECTABLE_BASE_CLASS = cn(CARD_HOVER_MOTION_CLASS, "cursor-pointer touch-manipulation")

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
        onFocus={(e) => {
          e.currentTarget.blur()
          props.onFocus?.(e)
        }}
        tabIndex={-1}
        {...props}
      >
        {children}
      </div>
    )
  }
)
Selectable.displayName = "Selectable"

export { Selectable }
