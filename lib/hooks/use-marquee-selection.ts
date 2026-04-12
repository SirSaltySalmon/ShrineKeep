"use client"

import React, { useState, useRef, useCallback, useEffect } from "react"

function rectsIntersect(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number }
): boolean {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom)
}

function hasDirectTextNode(el: HTMLElement): boolean {
  return Array.from(el.childNodes).some(
    (node) => node.nodeType === Node.TEXT_NODE && (node.textContent?.trim().length ?? 0) > 0
  )
}

function isTextSelectableTarget(target: HTMLElement): boolean {
  if (
    target.closest(
      "input, textarea, select, option, label, [contenteditable=''], [contenteditable='true'], [contenteditable='plaintext-only']"
    )
  ) {
    return true
  }

  if (target.closest("[data-allow-text-selection]")) return true

  const textLikeAncestor = target.closest(
    "p, span, h1, h2, h3, h4, h5, h6, li, dt, dd, td, th, blockquote, code, pre, strong, em, small, mark"
  )
  if (textLikeAncestor) return true

  return hasDirectTextNode(target)
}

export type MarqueeRect = { startX: number; startY: number; endX: number; endY: number }

export interface UseMarqueeSelectionReturn {
  selectedItemIds: Set<string>
  setSelectedItemIds: React.Dispatch<React.SetStateAction<Set<string>>>
  selectedBoxIds: Set<string>
  setSelectedBoxIds: React.Dispatch<React.SetStateAction<Set<string>>>
  registerItemCardRef: (id: string, el: HTMLDivElement | null) => void
  registerBoxCardRef: (id: string, el: HTMLDivElement | null) => void
  handleMouseDown: (e: React.MouseEvent) => void
  marquee: MarqueeRect | null
  /** Component to render the marquee overlay. Should be rendered at the dashboard level. */
  MarqueeOverlay: () => React.ReactElement | null
}

/**
 * Dashboard-wide marquee (drag-to-select) selection logic for both items and boxes.
 * Can be drawn from anywhere on the dashboard, not just from a specific grid.
 * 
 * Usage:
 * - Call registerItemCardRef(id, el) for each item card
 * - Call registerBoxCardRef(id, el) for each box card
 * - Attach handleMouseDown to the dashboard container
 * - Render <MarqueeOverlay /> at the dashboard level
 */
export function useMarqueeSelection(): UseMarqueeSelectionReturn {
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(() => new Set())
  const [selectedBoxIds, setSelectedBoxIds] = useState<Set<string>>(() => new Set())
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null)
  const itemCardRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const boxCardRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const marqueeCurrentRef = useRef<MarqueeRect | null>(null)
  const previousUserSelectRef = useRef<string | null>(null)
  const dragThresholdPassedRef = useRef(false)

  const disableTextSelection = useCallback(() => {
    if (previousUserSelectRef.current !== null) return
    previousUserSelectRef.current = document.body.style.userSelect
    document.body.style.userSelect = "none"
  }, [])

  const restoreTextSelection = useCallback(() => {
    if (previousUserSelectRef.current === null) return
    document.body.style.userSelect = previousUserSelectRef.current
    previousUserSelectRef.current = null
  }, [])

  const registerItemCardRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) itemCardRefs.current.set(id, el)
    else itemCardRefs.current.delete(id)
  }, [])

  const registerBoxCardRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) boxCardRefs.current.set(id, el)
    else boxCardRefs.current.delete(id)
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only start marquee on left click, and only if clicking on background (not on a card or button)
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    // Don't start marquee if clicking on interactive elements
    if (target.closest("button, a, [role='button'], [data-drag-handle]")) return
    // Don't start marquee if clicking on a card
    if (target.closest("[data-item-id], [data-box-id]")) return
    // Preserve native text interactions (drag-select and double-click word selection)
    if (isTextSelectableTarget(target)) return

    dragThresholdPassedRef.current = false
    setMarquee({ startX: e.clientX, startY: e.clientY, endX: e.clientX, endY: e.clientY })
  }, [])

  useEffect(() => {
    marqueeCurrentRef.current = marquee
  }, [marquee])

  useEffect(() => {
    if (marquee === null) return
    const onMove = (e: MouseEvent) => {
      setMarquee((m) => {
        if (!m) return null
        const next = { ...m, endX: e.clientX, endY: e.clientY }
        const width = Math.abs(next.endX - next.startX)
        const height = Math.abs(next.endY - next.startY)
        if (!dragThresholdPassedRef.current && (width >= 4 || height >= 4)) {
          dragThresholdPassedRef.current = true
          disableTextSelection()
        }
        marqueeCurrentRef.current = next
        return next
      })
    }
    const onUp = () => {
      const m = marqueeCurrentRef.current
      setMarquee(null)
      if (m) {
        const left = Math.min(m.startX, m.endX)
        const right = Math.max(m.startX, m.endX)
        const top = Math.min(m.startY, m.endY)
        const bottom = Math.max(m.startY, m.endY)
        if (right - left >= 4 || bottom - top >= 4) {
          const rect = { left, right, top, bottom }
          // Select intersecting items
          setSelectedItemIds((prev) => {
            const next = new Set(prev)
            itemCardRefs.current.forEach((el, id) => {
              const r = el.getBoundingClientRect()
              if (rectsIntersect(rect, { left: r.left, top: r.top, right: r.right, bottom: r.bottom })) {
                next.add(id)
              }
            })
            return next
          })
          // Select intersecting boxes
          setSelectedBoxIds((prev) => {
            const next = new Set(prev)
            boxCardRefs.current.forEach((el, id) => {
              const r = el.getBoundingClientRect()
              if (rectsIntersect(rect, { left: r.left, top: r.top, right: r.right, bottom: r.bottom })) {
                next.add(id)
              }
            })
            return next
          })
        } else {
          // Click (not drag) - clear selection
          setSelectedItemIds(new Set())
          setSelectedBoxIds(new Set())
        }
      }
      dragThresholdPassedRef.current = false
      restoreTextSelection()
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      dragThresholdPassedRef.current = false
      restoreTextSelection()
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [marquee !== null, disableTextSelection, restoreTextSelection])

  const MarqueeOverlay = useCallback((): React.ReactElement | null => {
    if (!marquee) return null
    return React.createElement(
      "div",
      {
        className: "pointer-events-none fixed border-2 border-primary/50 bg-primary/10 z-50",
        style: {
          left: Math.min(marquee.startX, marquee.endX),
          top: Math.min(marquee.startY, marquee.endY),
          width: Math.abs(marquee.endX - marquee.startX),
          height: Math.abs(marquee.endY - marquee.startY),
        },
      }
    )
  }, [marquee])

  return {
    selectedItemIds,
    setSelectedItemIds,
    selectedBoxIds,
    setSelectedBoxIds,
    registerItemCardRef,
    registerBoxCardRef,
    handleMouseDown,
    marquee,
    MarqueeOverlay,
  }
}
