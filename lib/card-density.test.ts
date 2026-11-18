import { describe, expect, it, vi } from "vitest"
import {
  BOX_GRID_LAYOUT,
  BOX_SPARKLINE_HEIGHT,
  CARD_DENSITIES,
  CARD_DENSITY_STORAGE_KEY,
  DEFAULT_CARD_DENSITY,
  ITEM_GRID_LAYOUT,
  createCardDensityStore,
  getBoxCardMinHeightClass,
  getCardSkeletonName,
  getItemCardMinHeightClass,
  parseCardDensity,
  takeLoadingFixtures,
  type CardDensityStorage,
  type CardGridLayout,
} from "./card-density"

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  const storage: CardDensityStorage = {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value)
    }),
  }
  return { data, storage }
}

const BREAKPOINTS = ["base", "sm", "md", "lg", "xl"]

/** Columns at each Tailwind breakpoint, carrying the last value up like the cascade does. */
function columnsByBreakpoint(layout: CardGridLayout): number[] {
  const columns = new Map<string, number>()
  for (const cls of layout.gridClass.split(" ")) {
    const match = /^(?:(sm|md|lg|xl):)?grid-cols-(\d+)$/.exec(cls)
    if (match) columns.set(match[1] ?? "base", Number(match[2]))
  }
  let current = columns.get("base") ?? 1
  return BREAKPOINTS.map((breakpoint) => {
    current = columns.get(breakpoint) ?? current
    return current
  })
}

/** How many loading cards are visible at each breakpoint. */
function visibleLoadingCards(layout: CardGridLayout): number[] {
  return BREAKPOINTS.map(
    (_, at) =>
      layout.loadingCardVisibility.filter((cls) => {
        if (cls === "") return true
        const match = /^hidden (sm|md|lg|xl):block$/.exec(cls)
        if (!match) throw new Error(`unexpected visibility class: ${cls}`)
        return BREAKPOINTS.indexOf(match[1]!) <= at
      }).length
  )
}

describe("parseCardDensity", () => {
  it("accepts the known densities", () => {
    for (const density of CARD_DENSITIES) expect(parseCardDensity(density)).toBe(density)
  })

  it("falls back to comfortable for anything else", () => {
    expect(DEFAULT_CARD_DENSITY).toBe("comfortable")
    for (const raw of [null, undefined, "", "COMPACT", "cozy", 1, {}]) {
      expect(parseCardDensity(raw)).toBe("comfortable")
    }
  })
})

describe("card density store", () => {
  it("is comfortable on the server whatever is stored", () => {
    const { storage } = memoryStorage({ [CARD_DENSITY_STORAGE_KEY]: "compact" })
    const store = createCardDensityStore({ getStorage: () => storage })
    expect(store.getServerSnapshot()).toBe("comfortable")
    expect(storage.getItem).not.toHaveBeenCalled()
  })

  it("reads the stored value once and then serves it from memory", () => {
    const { storage } = memoryStorage({ [CARD_DENSITY_STORAGE_KEY]: "compact" })
    const store = createCardDensityStore({ getStorage: () => storage })
    expect(store.getSnapshot()).toBe("compact")
    expect(store.getSnapshot()).toBe("compact")
    expect(storage.getItem).toHaveBeenCalledTimes(1)
  })

  it("defaults to comfortable when nothing or rubbish is stored", () => {
    expect(createCardDensityStore({ getStorage: () => memoryStorage().storage }).getSnapshot()).toBe("comfortable")
    const { storage } = memoryStorage({ [CARD_DENSITY_STORAGE_KEY]: "tiny" })
    expect(createCardDensityStore({ getStorage: () => storage }).getSnapshot()).toBe("comfortable")
  })

  it("persists a change and tells every subscriber once", () => {
    const { data, storage } = memoryStorage()
    const store = createCardDensityStore({ getStorage: () => storage })
    const first = vi.fn()
    const second = vi.fn()
    store.subscribe(first)
    const stopSecond = store.subscribe(second)

    store.set("compact")
    expect(store.getSnapshot()).toBe("compact")
    expect(data.get(CARD_DENSITY_STORAGE_KEY)).toBe("compact")
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)

    // Same value again: nothing to announce.
    store.set("compact")
    expect(first).toHaveBeenCalledTimes(1)

    stopSecond()
    store.set("comfortable")
    expect(first).toHaveBeenCalledTimes(2)
    expect(second).toHaveBeenCalledTimes(1)
    expect(data.get(CARD_DENSITY_STORAGE_KEY)).toBe("comfortable")
  })

  it("keeps working when storage is missing or throws", () => {
    const none = createCardDensityStore({ getStorage: () => null })
    expect(none.getSnapshot()).toBe("comfortable")
    none.set("compact")
    expect(none.getSnapshot()).toBe("compact")

    const blocked = createCardDensityStore({
      getStorage: () => {
        throw new Error("SecurityError")
      },
    })
    const listener = vi.fn()
    blocked.subscribe(listener)
    expect(blocked.getSnapshot()).toBe("comfortable")
    blocked.set("compact")
    expect(blocked.getSnapshot()).toBe("compact")
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("follows a change made in another tab while someone is subscribed", () => {
    const { data, storage } = memoryStorage()
    const watch: { notify: (() => void) | null } = { notify: null }
    const stopWatching = vi.fn()
    const watchStorage = vi.fn((onExternalChange: () => void) => {
      watch.notify = onExternalChange
      return stopWatching
    })
    const store = createCardDensityStore({ getStorage: () => storage, watchStorage })
    expect(watchStorage).not.toHaveBeenCalled()

    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    const unsubscribeOther = store.subscribe(() => {})
    expect(watchStorage).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot()).toBe("comfortable")

    data.set(CARD_DENSITY_STORAGE_KEY, "compact")
    watch.notify?.()
    expect(store.getSnapshot()).toBe("compact")
    expect(listener).toHaveBeenCalledTimes(1)

    // A storage event that leaves the value as it was changes nothing.
    watch.notify?.()
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    expect(stopWatching).not.toHaveBeenCalled()
    unsubscribeOther()
    expect(stopWatching).toHaveBeenCalledTimes(1)
  })
})

describe("grid layouts", () => {
  it("comfortable is the original grid for items and boxes", () => {
    const original = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
    expect(ITEM_GRID_LAYOUT.comfortable.gridClass).toBe(original)
    expect(BOX_GRID_LAYOUT.comfortable.gridClass).toBe(original)
    expect(ITEM_GRID_LAYOUT.comfortable.loadingCardVisibility).toEqual([
      "",
      "hidden md:block",
      "hidden lg:block",
      "hidden xl:block",
    ])
  })

  it("compact has more columns than comfortable at every breakpoint, two on phones", () => {
    for (const layouts of [ITEM_GRID_LAYOUT, BOX_GRID_LAYOUT]) {
      const comfortable = columnsByBreakpoint(layouts.comfortable)
      const compact = columnsByBreakpoint(layouts.compact)
      expect(compact[0]).toBe(2)
      compact.forEach((columns, index) => expect(columns).toBeGreaterThan(comfortable[index]!))
    }
  })

  it("shows exactly one row of loading cards at every breakpoint", () => {
    for (const layouts of [ITEM_GRID_LAYOUT, BOX_GRID_LAYOUT]) {
      for (const density of CARD_DENSITIES) {
        expect(visibleLoadingCards(layouts[density])).toEqual(columnsByBreakpoint(layouts[density]))
      }
    }
  })

  it("wraps fixtures around to fill a loading row", () => {
    expect(takeLoadingFixtures(["a", "b", "c", "d", "e"], ITEM_GRID_LAYOUT.comfortable)).toEqual(["a", "b", "c", "d"])
    expect(takeLoadingFixtures(["a", "b", "c", "d"], ITEM_GRID_LAYOUT.compact)).toEqual(["a", "b", "c", "d", "a", "b"])
    expect(takeLoadingFixtures([], ITEM_GRID_LAYOUT.compact)).toEqual([])
  })
})

describe("card heights", () => {
  const px = (cls: string) => Number(/^min-h-\[(\d+)px\]$/.exec(cls)?.[1])

  it("comfortable keeps the original minimum heights", () => {
    expect(getItemCardMinHeightClass("comfortable", "collection")).toBe("min-h-[424px]")
    expect(getItemCardMinHeightClass("comfortable", "wishlist")).toBe("min-h-[450px]")
    expect(getBoxCardMinHeightClass("comfortable", false)).toBe("min-h-[152px]")
  })

  it("compact item cards are roughly half height", () => {
    for (const variant of ["collection", "wishlist"] as const) {
      const ratio =
        px(getItemCardMinHeightClass("compact", variant)) / px(getItemCardMinHeightClass("comfortable", variant))
      expect(ratio).toBeGreaterThan(0.45)
      expect(ratio).toBeLessThan(0.6)
    }
  })

  it("comfortable keeps the bare skeleton name and compact gets its own", () => {
    expect(getCardSkeletonName("box-grid-card", "comfortable")).toBe("box-grid-card")
    expect(getCardSkeletonName("box-grid-card", "compact")).toBe("box-grid-card-compact")
  })

  it("compact box cards are shorter, with or without a sparkline row", () => {
    for (const withSparkline of [false, true]) {
      expect(px(getBoxCardMinHeightClass("compact", withSparkline))).toBeLessThan(
        px(getBoxCardMinHeightClass("comfortable", withSparkline))
      )
    }
  })

  it("a sparkline row adds its own height plus the margin above it", () => {
    // mt-2 (8px) comfortable, mt-1.5 (6px) compact: see box-card.tsx.
    const margin = { comfortable: 8, compact: 6 } as const
    for (const density of CARD_DENSITIES) {
      expect(px(getBoxCardMinHeightClass(density, true)) - px(getBoxCardMinHeightClass(density, false))).toBe(
        BOX_SPARKLINE_HEIGHT[density] + margin[density]
      )
    }
  })
})
