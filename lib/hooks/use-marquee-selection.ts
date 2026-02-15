"use client"

import { useState, useRef, useCallback, useEffect } from "react"

function rectsIntersect(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number }
): boolean {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom)
}

export type MarqueeRect = { startX: number; startY: number; endX: number; endY: number }

export interface UseMarqueeSelectionReturn {
  selectedIds: Set<string>
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>
  gridRef: React.RefObject<HTMLDivElement>
  registerCardRef: (id: string, el: HTMLDivElement | null) => void
  handleGridMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void
  marquee: MarqueeRect | null
}

/**
 * Shared marquee (drag-to-select) selection logic for item grids.
 * Use with a grid whose direct children are card wrappers that call registerCardRef(id, el).
 * On mousedown on empty grid space, start marquee; on mouseup, add intersecting card ids to selection (or clear if click).
 */
export function useMarqueeSelection(): UseMarqueeSelectionReturn {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const marqueeCurrentRef = useRef<MarqueeRect | null>(null)

  const registerCardRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) cardRefs.current.set(id, el)
    else cardRefs.current.delete(id)
  }, [])

  const handleGridMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== gridRef.current || e.button !== 0) return
    setMarquee({ startX: e.clientX, startY: e.clientY, endX: e.clientX, endY: e.clientY })
  }, [])

  useEffect(() => {
    marqueeCurrentRef.current = marquee
  }, [marquee])

  useEffect(() => {
    if (marquee === null) return
    const onMove = (e: MouseEvent) => {
      setMarquee((m) => {
        const next = m ? { ...m, endX: e.clientX, endY: e.clientY } : null
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
          setSelectedIds((prev) => {
            const next = new Set(prev)
            cardRefs.current.forEach((el, id) => {
              const r = el.getBoundingClientRect()
              if (rectsIntersect(rect, { left: r.left, top: r.top, right: r.right, bottom: r.bottom })) {
                next.add(id)
              }
            })
            return next
          })
        } else {
          setSelectedIds(new Set())
        }
      }
    }
    const prevUserSelect = document.body.style.userSelect
    document.body.style.userSelect = "none"
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      document.body.style.userSelect = prevUserSelect
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [marquee !== null])

  return {
    selectedIds,
    setSelectedIds,
    gridRef,
    registerCardRef,
    handleGridMouseDown,
    marquee,
  }
}
