"use client"

import { useEffect, useLayoutEffect, useRef } from "react"

/** Same timing as `.sk-fade-in` in `app/globals.css`. Keep the two in step. */
export const FADE_IN_MS = 200
export const FADE_IN_EASING = "ease-out"

export type FadeSignal = string | number | boolean | null | undefined

export interface FadeOnChangeOptions {
  /** Also fade when the element first mounts (a tab's content appearing). Default false. */
  onMount?: boolean
  /**
   * False while the element shows something that should not fade in, such as a skeleton.
   * A change seen while disabled is not replayed later. Default true.
   */
  enabled?: boolean
}

/**
 * Whether a render should play the fade. `previous` is `undefined` wrapped in `{ first: true }`
 * on the first render, so a signal that is itself `undefined` is still a real value.
 */
export function shouldPlayFade(
  state: { first: true } | { first: false; previous: FadeSignal },
  next: FadeSignal,
  { onMount = false, enabled = true }: FadeOnChangeOptions = {}
): boolean {
  if (!enabled) return false
  if (state.first) return onMount
  return state.previous !== next
}

/** Fade an element in from transparent. Opacity only. Nothing happens under reduced motion. */
export function playFadeIn(element: HTMLElement | null): void {
  if (!element || typeof element.animate !== "function") return
  if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
  element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_IN_MS, easing: FADE_IN_EASING })
}

// Before paint, so new content never shows for a frame at full opacity and then restarts from 0.
const useBeforePaintEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

/**
 * Replays the loaded-content fade on an element each time `signal` changes: a tab switch, a
 * filter, a figure that was recalculated. The element is not remounted, so nothing inside it
 * loses state. Returns the ref to attach.
 *
 * To fade content that replaces a skeleton, put the loading state in the signal and pass
 * `enabled: !loading`: the change to the loaded signal plays, the change back does not.
 */
export function useFadeOnChange<T extends HTMLElement>(signal: FadeSignal, options: FadeOnChangeOptions = {}) {
  const { onMount = false, enabled = true } = options
  const ref = useRef<T>(null)
  const seen = useRef<{ first: true } | { first: false; previous: FadeSignal }>({ first: true })

  useBeforePaintEffect(() => {
    const play = shouldPlayFade(seen.current, signal, { onMount, enabled })
    seen.current = { first: false, previous: signal }
    if (play) playFadeIn(ref.current)
  }, [signal, onMount, enabled])

  return ref
}
