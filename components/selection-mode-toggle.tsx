"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import { CheckSquare, X, LayoutGrid, Package } from "lucide-react"
import { cn } from "@/lib/utils"

interface SelectionModeToggleProps {
  selectionMode: boolean
  onEnterSelectionMode: () => void
  onExitSelectionMode: () => void
  /** When true, the floating button moves up so it sits above the selection action bar. */
  actionBarVisible?: boolean
  /** Callback to select all items currently on the page. */
  onSelectAllItems?: () => void
  /** Callback to select all boxes currently on the page. */
  onSelectAllBoxes?: () => void
  /** Number of items on the current page (for label). */
  itemCount?: number
  /** Number of boxes on the current page (for label). */
  boxCount?: number
  className?: string
}

const ACTION_BAR_HEIGHT = 60

/**
 * Floating overlay in the bottom-right: hover to reveal "Select" FAB; in selection mode
 * expands to show "Select all items", "Select all boxes", and "Done". Moves up when the
 * selection action bar is visible.
 */
export function SelectionModeToggle({
  selectionMode,
  onEnterSelectionMode,
  onExitSelectionMode,
  actionBarVisible = false,
  onSelectAllItems,
  onSelectAllBoxes,
  itemCount = 0,
  boxCount = 0,
  className,
}: SelectionModeToggleProps) {
  const bottomOffset = actionBarVisible ? ACTION_BAR_HEIGHT + 12 : 24

  if (selectionMode) {
    return (
      <div
        className={cn("fixed z-30 flex flex-col items-end", className)}
        style={{ right: 24, bottom: bottomOffset }}
      >
        <div className="min-w-[220px] rounded-2xl border border-border bg-card/95 backdrop-blur shadow-xl overflow-hidden transition-all duration-200 py-2.5 px-3">
          <p className="text-xs text-muted-foreground text-center mb-2">
            Tap items or boxes to select
          </p>
          <div className="flex flex-col gap-0.5">
            {typeof onSelectAllItems === "function" && itemCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="justify-start gap-2 rounded-xl h-9 text-sm font-normal"
                onClick={onSelectAllItems}
              >
                <LayoutGrid className="h-4 w-4 shrink-0 opacity-70" />
                Select all {itemCount} item{itemCount === 1 ? "" : "s"}
              </Button>
            )}
            {typeof onSelectAllBoxes === "function" && boxCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="justify-start gap-2 rounded-xl h-9 text-sm font-normal"
                onClick={onSelectAllBoxes}
              >
                <Package className="h-4 w-4 shrink-0 opacity-70" />
                Select all {boxCount} box{boxCount === 1 ? "" : "es"}
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="rounded-xl h-9 gap-2 mt-1.5 w-full"
              onClick={onExitSelectionMode}
            >
              <X className="h-4 w-4 shrink-0" />
              Done
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn("fixed z-30 flex flex-col items-end", className)}
      style={{ right: 24, bottom: bottomOffset }}
    >
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className={cn(
          "h-12 w-12 rounded-2xl border border-border bg-card/95 backdrop-blur shadow-lg transition-all duration-200",
          "hover:scale-105 hover:shadow-xl hover:bg-card",
          "opacity-90 hover:opacity-100"
        )}
        onClick={onEnterSelectionMode}
        aria-label="Enter selection mode"
      >
        <CheckSquare className="h-5 w-5" />
      </Button>
    </div>
  )
}
