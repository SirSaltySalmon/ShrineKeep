"use client"

import { useEffect } from "react"

const MOBILE_SAFARI_DRAG_CLASS = "mobile-safari-drag-active"
const TOP_SCROLL_GUARD_PX = 10

function isMobile() {
  if (typeof window === "undefined") return false

  const hasTouch = navigator.maxTouchPoints > 0
  return hasTouch
}

/**
 * iOS Safari can cancel active touch drags when the browser chrome expands while the page
 * reaches the top edge. Keep normal scrolling enabled, but avoid hitting scrollY === 0.
 */
export function useMobileSafariDragGuard(isDragging: boolean) {
  useEffect(() => {
    if (!isDragging || !isMobile()) return

    const root = document.documentElement
    const viewport = window.visualViewport
    root.classList.add(MOBILE_SAFARI_DRAG_CLASS)

    let rafId: number | null = null

    const keepDocumentAwayFromTop = () => {
      rafId = null
      if (window.scrollY <= TOP_SCROLL_GUARD_PX) {
        window.scrollTo({ top: TOP_SCROLL_GUARD_PX + 1, behavior: "auto" })
      }
    }

    const scheduleTopGuard = () => {
      if (rafId !== null) return
      rafId = window.requestAnimationFrame(keepDocumentAwayFromTop)
    }

    window.addEventListener("scroll", scheduleTopGuard, { passive: true })
    viewport?.addEventListener("resize", scheduleTopGuard)
    scheduleTopGuard()

    return () => {
      root.classList.remove(MOBILE_SAFARI_DRAG_CLASS)
      window.removeEventListener("scroll", scheduleTopGuard)
      viewport?.removeEventListener("resize", scheduleTopGuard)
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId)
      }
    }
  }, [isDragging])
}
