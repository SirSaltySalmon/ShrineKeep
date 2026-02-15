"use client"

import { useState, useCallback, useEffect } from "react"
import { useMarqueeSelection } from "./use-marquee-selection"

export interface UseDashboardSelectionReturn {
  // Item selection (from marquee hook)
  selectedItemIds: Set<string>
  setSelectedItemIds: React.Dispatch<React.SetStateAction<Set<string>>>
  gridRef: React.RefObject<HTMLDivElement>
  registerCardRef: (id: string, el: HTMLDivElement | null) => void
  handleGridMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void
  marquee: ReturnType<typeof useMarqueeSelection>["marquee"]
  // Box selection
  selectedBoxIds: Set<string>
  setSelectedBoxIds: React.Dispatch<React.SetStateAction<Set<string>>>
  // Combined helpers
  clearSelection: () => void
  hasSelection: boolean
  toggleBoxSelection: (boxId: string) => void
  isBoxSelected: (boxId: string) => boolean
  isItemSelected: (itemId: string) => boolean
  toggleItemSelection: (itemId: string) => void
}

/**
 * Unified selection state for dashboard: items (with marquee) + boxes.
 * Clears item selection when currentBoxId changes (navigate).
 */
export function useDashboardSelection(currentBoxId: string | null): UseDashboardSelectionReturn {
  const marqueeReturn = useMarqueeSelection()
  const {
    selectedIds: selectedItemIds,
    setSelectedIds: setSelectedItemIds,
    gridRef,
    registerCardRef,
    handleGridMouseDown,
    marquee,
  } = marqueeReturn

  const [selectedBoxIds, setSelectedBoxIds] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    setSelectedItemIds(new Set())
  }, [currentBoxId, setSelectedItemIds])

  const clearSelection = useCallback(() => {
    setSelectedItemIds(new Set())
    setSelectedBoxIds(new Set())
  }, [setSelectedItemIds])

  const hasSelection =
    selectedItemIds.size > 0 || selectedBoxIds.size > 0

  const toggleBoxSelection = useCallback((boxId: string) => {
    setSelectedBoxIds((prev) => {
      const next = new Set(prev)
      if (next.has(boxId)) next.delete(boxId)
      else next.add(boxId)
      return next
    })
  }, [])

  const isBoxSelected = useCallback(
    (boxId: string) => selectedBoxIds.has(boxId),
    [selectedBoxIds]
  )

  const isItemSelected = useCallback(
    (itemId: string) => selectedItemIds.has(itemId),
    [selectedItemIds]
  )

  const toggleItemSelection = useCallback((itemId: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }, [setSelectedItemIds])

  return {
    selectedItemIds,
    setSelectedItemIds,
    gridRef,
    registerCardRef,
    handleGridMouseDown,
    marquee,
    selectedBoxIds,
    setSelectedBoxIds,
    clearSelection,
    hasSelection,
    toggleBoxSelection,
    isBoxSelected,
    isItemSelected,
    toggleItemSelection,
  }
}
