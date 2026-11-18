import { describe, expect, it } from "vitest"
import {
  collectItemTags,
  filterItemsByIncludeTags,
  getEffectiveIncludeTagIds,
  toggleIncludeTag,
} from "./tag-quick-filter"
import { DEFAULT_SEARCH_FILTERS, type Tag, type TagColor } from "./types"

const tag = (id: string, name: string, color: TagColor): Tag => ({
  id,
  user_id: "u",
  name,
  color,
  created_at: "",
})

const mecha = tag("t-mecha", "Mecha", "red")
const sealed = tag("t-sealed", "Sealed", "green")
const hg = tag("t-hg", "HG", "blue")
const mg = tag("t-mg", "MG", "blue")

const items = [
  { id: "a", tags: [hg, mecha] },
  { id: "b", tags: [mecha, mg] },
  { id: "c", tags: [sealed] },
  { id: "d", tags: [] },
  { id: "e" },
]

describe("collectItemTags", () => {
  it("lists each tag once, in rainbow order then by name", () => {
    expect(collectItemTags(items).map((t) => t.id)).toEqual(["t-mecha", "t-sealed", "t-hg", "t-mg"])
  })

  it("returns nothing when no item is tagged", () => {
    expect(collectItemTags([{ tags: [] }, {}])).toEqual([])
    expect(collectItemTags([])).toEqual([])
  })
})

describe("getEffectiveIncludeTagIds", () => {
  it("keeps only the include-tags present on the listed items", () => {
    expect(getEffectiveIncludeTagIds(items, ["t-elsewhere", "t-sealed", "t-mecha"])).toEqual([
      "t-sealed",
      "t-mecha",
    ])
  })

  it("is empty when nothing is included or nothing matches", () => {
    expect(getEffectiveIncludeTagIds(items, [])).toEqual([])
    expect(getEffectiveIncludeTagIds(items, ["t-elsewhere"])).toEqual([])
  })
})

describe("filterItemsByIncludeTags", () => {
  it("keeps items carrying any included tag", () => {
    expect(filterItemsByIncludeTags(items, ["t-mecha"]).map((i) => i.id)).toEqual(["a", "b"])
    expect(filterItemsByIncludeTags(items, ["t-hg", "t-sealed"]).map((i) => i.id)).toEqual(["a", "c"])
  })

  it("returns the same list when no include-tag applies to it", () => {
    expect(filterItemsByIncludeTags(items, [])).toBe(items)
    expect(filterItemsByIncludeTags(items, ["t-elsewhere"])).toBe(items)
  })

  it("ignores include-tags from other boxes when another one applies", () => {
    expect(filterItemsByIncludeTags(items, ["t-elsewhere", "t-sealed"]).map((i) => i.id)).toEqual(["c"])
  })
})

describe("toggleIncludeTag", () => {
  it("adds a tag and leaves the other filters alone", () => {
    const filters = { ...DEFAULT_SEARCH_FILTERS, excludeTags: ["t-x"], valueMin: "5" }
    expect(toggleIncludeTag(filters, "t-mecha")).toEqual({ ...filters, includeTags: ["t-mecha"] })
    expect(filters.includeTags).toEqual([])
  })

  it("removes a tag that is already included", () => {
    const filters = { ...DEFAULT_SEARCH_FILTERS, includeTags: ["t-mecha", "t-sealed"] }
    expect(toggleIncludeTag(filters, "t-mecha").includeTags).toEqual(["t-sealed"])
  })
})
