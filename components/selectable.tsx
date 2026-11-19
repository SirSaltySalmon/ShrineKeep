"use client"

import * as React from "react"
import { cn, FOCUS_RING_CLASS, getSelectableRingClasses } from "@/lib/utils"

/**
 * Hover lift + shadow used by item/box cards. Pair with cursor-pointer (Selectable) or
 * cursor-default (read-only public cards).
 *
 * The shadow is `sk-card-hover` (app/globals.css): none at rest and Tailwind's `shadow-lg`
 * on hover when motion is allowed, except under a hard outline, where no blurred shadow
 * is added.
 */
export const CARD_HOVER_MOTION_CLASS =
  "rounded-lg sk-card-hover transition-[transform,box-shadow] duration-300 ease-out motion-reduce:hover:transform-none motion-safe:hover:-translate-y-0.5"

/**
 * Under a hard outline the card's offset shadow paints over the right and bottom edges of
 * the wrapper's ring. These repeat the ring as a CSS outline, which draws above the card.
 * Both are invisible (zero width) under a soft outline.
 */
const HARD_SELECTION_RING_CLASS = "sk-ring-selected"
const HARD_HOVER_RING_CLASS = "sk-ring-hover"

const SELECTABLE_BASE_CLASS = cn(CARD_HOVER_MOTION_CLASS, "cursor-pointer touch-manipulation", FOCUS_RING_CLASS)

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
 *
 * It is a keyboard button: a tab stop with a focus-visible ring, and Enter or Space clicks it.
 * `role`, `tabIndex`, `onFocus` and `onKeyDown` from the caller are honoured; the handlers run
 * before this component's own, and an `onKeyDown` that calls `preventDefault()` replaces the click.
 */
const Selectable = React.forwardRef<HTMLDivElement, SelectableProps>(
  (
    {
      selected = false,
      selectionMode = false,
      isOver = false,
      className,
      children,
      role = "button",
      tabIndex = 0,
      onFocus,
      onKeyDown,
      ...props
    },
    ref
  ) => {
    const showFullRing = selected || isOver
    return (
      <div
        ref={ref}
        role={role}
        tabIndex={tabIndex}
        {...props}
        className={cn(
          SELECTABLE_BASE_CLASS,
          getSelectableRingClasses(showFullRing, selectionMode),
          showFullRing ? HARD_SELECTION_RING_CLASS : selectionMode ? HARD_HOVER_RING_CLASS : null,
          className
        )}
        onFocus={(e) => {
          onFocus?.(e)
          // Pointer focus is dropped, as it always was here: a clicked card left focused gets a
          // ring with the next key press (or when the dialog it opened hands focus back), and
          // Space then clicks it again. Keyboard focus, the kind `:focus-visible` matches, stays.
          if (e.target === e.currentTarget && !e.currentTarget.matches(":focus-visible")) {
            e.currentTarget.blur()
          }
        }}
        onKeyDown={(e) => {
          onKeyDown?.(e)
          // Keys from a control inside the card (rename, mark as acquired) are that control's.
          if (e.defaultPrevented || e.target !== e.currentTarget) return
          if (e.key === "Enter" || e.key === " ") {
            // Space would otherwise scroll the page.
            e.preventDefault()
            if (!e.repeat) e.currentTarget.click()
          }
        }}
      >
        {children}
      </div>
    )
  }
)
Selectable.displayName = "Selectable"

export { Selectable }
