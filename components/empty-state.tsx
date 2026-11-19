"use client"

import { useEffect, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react"
import { Keeper, KEEPERS, type KeeperSpec } from "@/components/keeper"
import { LOADED_FADE_CLASS } from "@/lib/hooks/use-seen-loading"
import { weightedPick } from "@/lib/weighted-pick"
import { cn } from "@/lib/utils"

/**
 * The Keeper for one empty state, drawn at the blind-box game's pull odds
 * (`KeeperSpec.weight`): mostly commons, now and then a rare, rarely the secret one.
 * `roll` is a uniform sample in [0, 1).
 */
export function drawEmptyStateKeeper(roll: number): KeeperSpec {
  return weightedPick(KEEPERS, roll) ?? KEEPERS[0]
}

const FIGURE_SIZE_CLASS = {
  /** 64px, for short containers. */
  sm: "h-16",
  /** 80px. */
  md: "h-20",
} as const

/** The Keeper's viewBox (64 x 70), so the reserved space matches the figure. */
const FIGURE_ASPECT = "64 / 70"

// Before paint, so an empty state that mounts on the client shows its figure in the first frame.
const useBeforePaintEffect = typeof window === "undefined" ? useEffect : useLayoutEffect
const subscribeToNothing = () => () => {}

interface EmptyStateKeeperProps {
  size?: keyof typeof FIGURE_SIZE_CLASS
  className?: string
}

/**
 * The figure on its own: centred and decorative (hidden from assistive tech). Each mount draws
 * a new Keeper. The draw happens on the client, because a figure picked on the server would not
 * match the one picked while hydrating; until then the figure's space is held empty.
 */
export function EmptyStateKeeper({ size = "md", className }: EmptyStateKeeperProps) {
  // False while hydrating server HTML, true when this mounts on the client. Only a figure that
  // arrives after server HTML was already on screen fades in; one drawn before paint does not.
  const mountedOnClient = useSyncExternalStore(subscribeToNothing, () => true, () => false)
  const [fadeIn] = useState(!mountedOnClient)
  const [spec, setSpec] = useState<KeeperSpec | null>(null)

  useBeforePaintEffect(() => {
    setSpec(drawEmptyStateKeeper(Math.random()))
  }, [])

  const sizing = cn("mx-auto w-auto", FIGURE_SIZE_CLASS[size], className)
  if (!spec) return <div aria-hidden className={sizing} style={{ aspectRatio: FIGURE_ASPECT }} />
  return <Keeper spec={spec} className={cn(sizing, fadeIn && LOADED_FADE_CLASS)} />
}

interface EmptyStateProps extends EmptyStateKeeperProps {
  /** The message. Rendered as given, below the figure. */
  children: ReactNode
}

/**
 * Empty-state block: a Keeper above a centred, muted message. Layout that
 * belongs to the caller (min-height, padding) goes in `className`.
 */
export function EmptyState({ size, className, children }: EmptyStateProps) {
  return (
    <div className={cn("text-center text-muted-foreground", className)}>
      <EmptyStateKeeper size={size} className="mb-3" />
      <div>{children}</div>
    </div>
  )
}
