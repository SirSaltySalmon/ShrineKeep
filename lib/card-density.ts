/**
 * Card density: how tightly item and box cards are packed.
 *
 * A per-device preference. It lives in localStorage, not in `user_settings`, so a phone
 * and a desktop can differ and no migration or API is involved. `comfortable` is the
 * layout the app has always had and the default; `compact` is opt-in.
 *
 * This file is pure (no React, no `window`) so the store and the class selection can be
 * unit tested. The browser instance and the hook are in `lib/hooks/use-card-density.ts`.
 */

export const CARD_DENSITIES = ["comfortable", "compact"] as const

export type CardDensity = (typeof CARD_DENSITIES)[number]

export const DEFAULT_CARD_DENSITY: CardDensity = "comfortable"

export const CARD_DENSITY_STORAGE_KEY = "shrinekeep:card-density"

/** Anything that is not a known density (missing key, old value, garbage) is the default. */
export function parseCardDensity(raw: unknown): CardDensity {
  return typeof raw === "string" && (CARD_DENSITIES as readonly string[]).includes(raw)
    ? (raw as CardDensity)
    : DEFAULT_CARD_DENSITY
}

/* -------------------------------------------------------------------------- */
/* Store                                                                      */
/* -------------------------------------------------------------------------- */

/** The part of `Storage` the store needs. */
export interface CardDensityStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface CardDensityStoreOptions {
  /** Returns the storage to use, or null when there is none. May throw (blocked storage). */
  getStorage: () => CardDensityStorage | null
  /**
   * Watch for the stored value changing outside this store (another tab). Called when the
   * first listener subscribes; the returned function is called when the last one leaves.
   */
  watchStorage?: (onExternalChange: () => void) => () => void
}

/** Shaped for `useSyncExternalStore`. */
export interface CardDensityStore {
  getSnapshot: () => CardDensity
  /** Always the default, so the server render and the hydration render agree. */
  getServerSnapshot: () => CardDensity
  set: (next: CardDensity) => void
  subscribe: (listener: () => void) => () => void
}

export function createCardDensityStore({ getStorage, watchStorage }: CardDensityStoreOptions): CardDensityStore {
  const listeners = new Set<() => void>()
  // Read once, then served from memory: getSnapshot runs on every render of every grid.
  let cached: CardDensity | null = null
  let stopWatching: (() => void) | null = null

  const read = (): CardDensity => {
    try {
      return parseCardDensity(getStorage()?.getItem(CARD_DENSITY_STORAGE_KEY))
    } catch {
      return DEFAULT_CARD_DENSITY
    }
  }

  const emit = () => {
    for (const listener of Array.from(listeners)) listener()
  }

  const getSnapshot = (): CardDensity => {
    if (cached === null) cached = read()
    return cached
  }

  return {
    getSnapshot,
    getServerSnapshot: () => DEFAULT_CARD_DENSITY,
    set(next) {
      const value = parseCardDensity(next)
      try {
        getStorage()?.setItem(CARD_DENSITY_STORAGE_KEY, value)
      } catch {
        // Storage blocked or full: the choice still holds for this page load.
      }
      if (value === cached) return
      cached = value
      emit()
    },
    subscribe(listener) {
      listeners.add(listener)
      if (listeners.size === 1 && watchStorage) {
        stopWatching = watchStorage(() => {
          const next = read()
          if (next === cached) return
          cached = next
          emit()
        })
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0 && stopWatching) {
          stopWatching()
          stopWatching = null
        }
      }
    },
  }
}

/* -------------------------------------------------------------------------- */
/* Layout                                                                     */
/* -------------------------------------------------------------------------- */

export interface CardGridLayout {
  /** Grid template and gap. Callers add their own extras (`relative`, margins). */
  gridClass: string
  /**
   * One class per skeleton card shown while loading. Together they fill exactly one row
   * at every breakpoint, so the list length is also how many skeleton cards to render.
   */
  loadingCardVisibility: readonly string[]
}

/** Comfortable is the original grid; item and box grids shared it. */
const COMFORTABLE_GRID: CardGridLayout = {
  gridClass: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4",
  loadingCardVisibility: ["", "hidden md:block", "hidden lg:block", "hidden xl:block"],
}

/** Item grids: 1 / 2 / 3 / 4 columns comfortable, 2 / 3 / 4 / 5 / 6 compact. */
export const ITEM_GRID_LAYOUT: Record<CardDensity, CardGridLayout> = {
  comfortable: COMFORTABLE_GRID,
  compact: {
    gridClass: "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3",
    loadingCardVisibility: ["", "", "hidden sm:block", "hidden md:block", "hidden lg:block", "hidden xl:block"],
  },
}

/**
 * Box grids: 1 / 2 / 3 / 4 columns comfortable, 2 / 3 / 4 / 5 compact. One column fewer
 * than items at each step because a box card is all text and needs the width.
 */
export const BOX_GRID_LAYOUT: Record<CardDensity, CardGridLayout> = {
  comfortable: COMFORTABLE_GRID,
  compact: {
    gridClass: "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3",
    loadingCardVisibility: ["", "", "hidden md:block", "hidden lg:block", "hidden xl:block"],
  },
}

/**
 * Skeleton cards for one loading row. There are fewer fixtures than a compact row has
 * columns, so the list wraps around.
 */
export function takeLoadingFixtures<T>(fixtures: readonly T[], layout: CardGridLayout): T[] {
  if (fixtures.length === 0) return []
  return layout.loadingCardVisibility.map((_, index) => fixtures[index % fixtures.length]!)
}

/**
 * Boneyard skeleton name for a card at this density. A compact card is laid out differently
 * (smaller thumbnail, no description), so it has its own captured bones: comfortable keeps
 * the bare name and compact adds a suffix. Both are captured from `app/boneyard-preview`.
 */
export function getCardSkeletonName(base: string, density: CardDensity): string {
  return density === "compact" ? `${base}-compact` : base
}

/**
 * Minimum card heights. Each is the height of a card with the usual content, so a row of
 * cards lines up even when some have less to show. Compact item cards are a little over
 * half the comfortable height.
 */
const ITEM_CARD_MIN_HEIGHT_CLASS: Record<CardDensity, Record<"collection" | "wishlist", string>> = {
  comfortable: { collection: "min-h-[424px]", wishlist: "min-h-[450px]" },
  compact: { collection: "min-h-[230px]", wishlist: "min-h-[252px]" },
}

export function getItemCardMinHeightClass(density: CardDensity, variant: "collection" | "wishlist"): string {
  return ITEM_CARD_MIN_HEIGHT_CLASS[density][variant]
}

/** Sparkline height on a box card, in px. */
export const BOX_SPARKLINE_HEIGHT: Record<CardDensity, number> = {
  comfortable: 32,
  compact: 24,
}

/**
 * Box cards that reserve a sparkline row are taller by the sparkline plus its top margin
 * (`mt-2` comfortable, `mt-1.5` compact), whether or not there is a line to draw.
 */
const BOX_CARD_MIN_HEIGHT_CLASS: Record<CardDensity, { plain: string; withSparkline: string }> = {
  comfortable: { plain: "min-h-[152px]", withSparkline: "min-h-[192px]" },
  compact: { plain: "min-h-[118px]", withSparkline: "min-h-[148px]" },
}

export function getBoxCardMinHeightClass(density: CardDensity, withSparkline: boolean): string {
  const heights = BOX_CARD_MIN_HEIGHT_CLASS[density]
  return withSparkline ? heights.withSparkline : heights.plain
}
