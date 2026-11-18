import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { KEEPERS } from "./keeper"
import { EMPTY_STATE_KEEPER_IDS, getEmptyStateKeeper, type EmptyStateFigure } from "./empty-state"
import { getBoxCardMinHeightClass } from "@/lib/card-density"

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8")
}

describe("empty-state keepers", () => {
  const figures = Object.keys(EMPTY_STATE_KEEPER_IDS) as EmptyStateFigure[]

  it("maps every place to a Keeper that exists", () => {
    const ids = KEEPERS.map((keeper) => keeper.id)
    for (const figure of figures) {
      expect(ids).toContain(EMPTY_STATE_KEEPER_IDS[figure])
      expect(getEmptyStateKeeper(figure).id).toBe(EMPTY_STATE_KEEPER_IDS[figure])
    }
  })

  it("uses the sleepy face for boxes and a wink for 404", () => {
    expect(getEmptyStateKeeper("boxes").face).toBe("sleepy")
    expect(getEmptyStateKeeper("notFound").face).toBe("wink")
  })
})

describe("empty states keep their copy and show a figure", () => {
  it("item grid", () => {
    const src = read("./item-grid.tsx")
    expect(src).toContain("<EmptyState")
    expect(src).toContain('emptyText = "No items yet. Click \\"New Item\\" to get started."')
    // Comfortable keeps the original block; compact has its own, shorter one.
    expect(src).toContain('"min-h-[424px] py-12"')
  })

  it("box grid", () => {
    const src = read("./box-grid.tsx")
    expect(src).toContain('<EmptyState figure="boxes"')
    expect(src).toContain('"Try adding a new box!"')
    expect(src).toContain('"Nothing is visible here."')
    // The block is as tall as the cards the grid would show: 152px comfortable, before the sparkline row.
    expect(src).toContain("className={cn(cardMinHeightClass,")
    expect(getBoxCardMinHeightClass("comfortable", false)).toBe("min-h-[152px]")
  })

  it("wishlists", () => {
    expect(read("../app/wishlist/wishlist-client.tsx")).toContain(
      'emptyText="Your wishlist is empty. Add items you want to acquire!"',
    )
    const shared = read("../app/wishlist/[token]/public-wishlist-client.tsx")
    expect(shared).toContain('<EmptyState figure="wishlist"')
    expect(shared).toContain("This wishlist is empty.")
  })

  it("404 page", () => {
    const src = read("../app/not-found.tsx")
    expect(src).toContain('<EmptyStateKeeper figure="notFound"')
    expect(src).toContain("This page doesn&apos;t exist or has been moved.")
  })
})

describe("item card placeholder and drag cursor", () => {
  const src = read("./item-card.tsx")

  it("tints from CSS variables, not the document-root helper", () => {
    expect(src).toContain("getPlaceholderTint(item.tags)")
    expect(src).toContain('!placeholderTint && "bg-muted"')
    expect(src).toContain('!placeholderTint && "text-muted-foreground"')
  })

  it("swaps the pointer for a grab cursor only when draggable", () => {
    expect(src).toContain("draggable = false")
    expect(src).toContain('draggable && "cursor-grab active:cursor-grabbing"')
  })
})
