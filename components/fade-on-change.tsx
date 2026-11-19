"use client"

import type { ReactNode } from "react"
import { useFadeOnChange, type FadeSignal } from "@/lib/hooks/use-fade-on-change"

interface FadeOnChangeProps {
  /** The fade replays when this changes. Usually the text being shown. */
  signal: FadeSignal
  className?: string
  children: ReactNode
}

/**
 * An inline wrapper whose content fades in each time `signal` changes: a figure, a count, a
 * label that depends on the view. Adds no layout of its own. Not for content that was only
 * restyled (hover, selection); for anything larger than a line use `useFadeOnChange`.
 */
export function FadeOnChange({ signal, className, children }: FadeOnChangeProps) {
  const ref = useFadeOnChange<HTMLSpanElement>(signal)
  return (
    <span ref={ref} className={className}>
      {children}
    </span>
  )
}
