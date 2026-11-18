import type { ReactNode } from "react"
import { Keeper, KEEPERS, type KeeperSpec } from "@/components/keeper"
import { cn } from "@/lib/utils"

/**
 * Which Keeper stands in each empty place. Values are ids from `KEEPERS`.
 * One figure per place, so the same emptiness always shows the same face.
 */
export const EMPTY_STATE_KEEPER_IDS = {
  /** Empty collection grid: the sprout. Something will grow here. */
  items: "moss",
  /** Empty wishlist (owner, profile tab, shared link): starry-eyed. */
  wishlist: "gilt",
  /** Empty box grid: the sleepy one. */
  boxes: "dusk",
  /** 404: the winking one. */
  notFound: "plum",
} as const

export type EmptyStateFigure = keyof typeof EMPTY_STATE_KEEPER_IDS

export function getEmptyStateKeeper(figure: EmptyStateFigure): KeeperSpec {
  const id = EMPTY_STATE_KEEPER_IDS[figure]
  return KEEPERS.find((keeper) => keeper.id === id) ?? KEEPERS[0]
}

const FIGURE_SIZE_CLASS = {
  /** 64px, for short containers. */
  sm: "h-16",
  /** 80px. */
  md: "h-20",
} as const

interface EmptyStateKeeperProps {
  figure: EmptyStateFigure
  size?: keyof typeof FIGURE_SIZE_CLASS
  className?: string
}

/** The figure on its own: centred and decorative (hidden from assistive tech). */
export function EmptyStateKeeper({ figure, size = "md", className }: EmptyStateKeeperProps) {
  return (
    <Keeper
      spec={getEmptyStateKeeper(figure)}
      className={cn("mx-auto w-auto", FIGURE_SIZE_CLASS[size], className)}
    />
  )
}

interface EmptyStateProps extends EmptyStateKeeperProps {
  /** The message. Rendered as given, below the figure. */
  children: ReactNode
}

/**
 * Empty-state block: a Keeper above a centred, muted message. Layout that
 * belongs to the caller (min-height, padding) goes in `className`.
 */
export function EmptyState({ figure, size, className, children }: EmptyStateProps) {
  return (
    <div className={cn("text-center text-muted-foreground", className)}>
      <EmptyStateKeeper figure={figure} size={size} className="mb-3" />
      <div>{children}</div>
    </div>
  )
}
