"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export type ScrollRevealProps = {
  children: React.ReactNode
  className?: string
  /**
   * Adds a staggered entrance delay (ms) when the element becomes visible.
   * Use small values like 0..300.
   */
  delayMs?: number
  /**
   * When true, the element will animate on every entry instead of only once.
   * Default: true (trigger once).
   */
  repeat?: boolean
  /**
   * IntersectionObserver threshold.
   * Default: 0.15
   */
  threshold?: number
}

/**
 * Scroll-based reveal with a “fade-up” feel:
 * - default: fades in + translates up into place
 * - `prefers-reduced-motion`: keeps translate at 0, but still fades in
 */
export function ScrollReveal({
  children,
  className,
  delayMs = 0,
  repeat = false,
  threshold = 0.15,
}: ScrollRevealProps) {
  const ref = React.useRef<HTMLDivElement | null>(null)
  const [revealed, setRevealed] = React.useState(false)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return

    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry) return

        if (entry.isIntersecting) {
          setRevealed(true)
          if (!repeat) obs.disconnect()
        } else if (repeat) {
          setRevealed(false)
        }
      },
      { threshold }
    )

    obs.observe(el)
    return () => obs.disconnect()
  }, [repeat, threshold])

  return (
    <div
      ref={ref}
      className={cn(
        "transition-[opacity,transform] duration-700 ease-out will-change-transform",
        "motion-reduce:transition-opacity",
        revealed ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6 motion-reduce:translate-y-0",
        className
      )}
      style={{ transitionDelay: `${delayMs}ms` }}
    >
      {children}
    </div>
  )
}

