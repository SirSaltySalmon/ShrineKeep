import { describe, expect, it } from "vitest"
import { buildSearchUrl, sortTagsByColorThenName } from "./utils"
import type { SearchFiltersState, Tag } from "./types"

describe("buildSearchUrl", () => {
  const emptyFilters: SearchFiltersState = {
    includeTags: [],
    excludeTags: [],
    valueMin: "",
    valueMax: "",
    acquisitionMin: "",
    acquisitionMax: "",
    dateFrom: "",
    dateTo: "",
    tagColors: [],
  }

  it("returns base search route when query and filters are empty", () => {
    expect(buildSearchUrl("", emptyFilters)).toBe("/dashboard/search")
  })

  it("includes query and selected filters in url params", () => {
    const filters: SearchFiltersState = {
      ...emptyFilters,
      includeTags: ["tag-a", "tag-b"],
      excludeTags: ["tag-c"],
      valueMin: "10",
      valueMax: "20",
      tagColors: ["red", "blue"],
    }

    expect(buildSearchUrl(" camera ", filters, 2)).toBe(
      "/dashboard/search?q=camera&includeTags=tag-a%2Ctag-b&excludeTags=tag-c&valueMin=10&valueMax=20&tagColors=red%2Cblue&page=2"
    )
  })
})

describe("sortTagsByColorThenName", () => {
  it("sorts tags by configured rainbow order then name", () => {
    const tags: Tag[] = [
      {
        id: "1",
        user_id: "u",
        name: "Zulu",
        color: "blue",
        created_at: "",
      },
      {
        id: "2",
        user_id: "u",
        name: "Alpha",
        color: "red",
        created_at: "",
      },
      {
        id: "3",
        user_id: "u",
        name: "Bravo",
        color: "red",
        created_at: "",
      },
    ]

    expect(sortTagsByColorThenName(tags).map((tag) => tag.id)).toEqual(["2", "3", "1"])
  })
})
