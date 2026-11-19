"use client"

import { useState } from "react"

/**
 * Fades an element in (`app/globals.css`). The animation runs when the class is added or the
 * element mounts with it, and not at all under reduced motion.
 */
export const LOADED_FADE_CLASS = "sk-fade-in"

/**
 * True once `loading` has been true during this component's life. Content that replaces a
 * skeleton fades in; content that was there on the first render (server data) must not, so
 * the fade is only applied after a load has actually been seen.
 */
export function useSeenLoading(loading: boolean): boolean {
  const [seen, setSeen] = useState(loading)
  if (loading && !seen) setSeen(true)
  return seen
}
