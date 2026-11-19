import { describe, expect, it } from "vitest"
import { loadBoxSparklines } from "./load-box-sparklines"
import { collectSubtreeBoxIds } from "./load-box-stats"
import {
  BOX,
  collectionFixture,
  fixtureId,
  FIXTURE_TODAY,
  OWNER,
  STRANGER,
} from "@/lib/stats/testing/collection-fixture"
import {
  createFakeSupabase,
  type FakeRow,
  type FakeSupabaseOptions,
  type FakeTables,
} from "@/lib/stats/testing/fake-supabase"

type Supabase = Parameters<typeof loadBoxSparklines>[0]

function load(tables: FakeTables, userId: string, boxIds: string[], options: FakeSupabaseOptions = {}) {
  const fake = createFakeSupabase(tables, { userId, ...options })
  const result = loadBoxSparklines(fake.client as unknown as Supabase, userId, boxIds, {
    today: FIXTURE_TODAY,
  })
  return { result, calls: fake.calls }
}

describe("collectSubtreeBoxIds", () => {
  const children = new Map<string, string[]>([
    ["a", ["b", "c"]],
    ["b", ["d"]],
  ])

  it("returns the box and everything nested under it", () => {
    expect(collectSubtreeBoxIds(children, "a")).toEqual(["a", "b", "c", "d"])
    expect(collectSubtreeBoxIds(children, "b")).toEqual(["b", "d"])
    expect(collectSubtreeBoxIds(children, "d")).toEqual(["d"])
  })

  it("stops on a cycle instead of looping", () => {
    const looped = new Map<string, string[]>([
      ["a", ["b"]],
      ["b", ["a"]],
    ])
    expect(collectSubtreeBoxIds(looped, "a")).toEqual(["a", "b"])
  })
})

describe("loadBoxSparklines", () => {
  it("builds each box's series from its own items and those in nested boxes", async () => {
    const { result } = load(collectionFixture(), OWNER, [BOX.shelf, BOX.drawer, BOX.tin])
    const sparklines = await result

    expect(sparklines[BOX.shelf]).toEqual({
      dates: ["2026-01-10", "2026-02-01", "2026-03-01", "2026-06-15", "2026-07-01"],
      // shelf item (80, 90, 100) + drawer item (60.25, 50.5 from Feb) + tin item (20, no history).
      value: [100, 160.25, 170.25, 170.5, 170.5],
      // Bought on the first two days, then carried forward so the cost line ends with the value line.
      acquisition: [80, 140.25, 140.25, 140.25, 140.25],
      currentValue: 170.5,
      totalAcquisition: 145.25,
    })
    expect(sparklines[BOX.drawer]).toEqual({
      dates: ["2026-02-01", "2026-06-15", "2026-07-01"],
      value: [80.25, 70.5, 70.5],
      acquisition: [60.25, 60.25, 60.25],
      currentValue: 70.5,
      totalAcquisition: 65.25,
    })
    // One bare item: a single point today, which is not a line.
    expect(sparklines[BOX.tin]).toEqual({
      dates: ["2026-07-01"],
      value: [20],
      acquisition: [],
      currentValue: 20,
      totalAcquisition: 5,
    })
  })

  it("returns an empty series for a box with no items", async () => {
    const { result } = load(collectionFixture(), OWNER, [BOX.empty])
    expect(await result).toEqual({
      [BOX.empty]: { dates: [], value: [], acquisition: [], currentValue: 0, totalAcquisition: 0 },
    })
  })

  it("leaves out boxes the user does not own, and unknown ids", async () => {
    const unknown = fixtureId("box", 777)
    const { result } = load(collectionFixture(), OWNER, [BOX.plain, BOX.strangers, unknown])
    expect(Object.keys(await result)).toEqual([BOX.plain])
  })

  it("gives another user nothing for the owner's boxes", async () => {
    const { result, calls } = load(collectionFixture(), STRANGER, [BOX.shelf, BOX.drawer])
    expect(await result).toEqual({})
    // No owned box in the request, so no item or history read at all.
    expect(calls.map((call) => call.table)).toEqual(["boxes"])
  })

  it("filters every read to the user and to collection items", async () => {
    const { result, calls } = load(collectionFixture(), OWNER, [BOX.shelf])
    const sparklines = await result
    // The stranger's item parked in the owner's box (4000) and the wishlist row (999) are not counted.
    expect(sparklines[BOX.shelf].currentValue).toBe(170.5)

    const boxes = calls.find((call) => call.table === "boxes")
    const items = calls.find((call) => call.table === "items")
    const history = calls.find((call) => call.table === "value_history")
    expect(boxes?.filters).toContainEqual({ op: "eq", column: "user_id", value: OWNER })
    expect(items?.filters).toContainEqual({ op: "eq", column: "user_id", value: OWNER })
    expect(items?.filters).toContainEqual({ op: "eq", column: "is_wishlist", value: false })
    // History is reached only through the ids of items that passed those filters.
    const historyIds = history?.filters.find((filter) => filter.op === "in")?.value
    expect(historyIds).toEqual([fixtureId("item", 1), fixtureId("item", 2), fixtureId("item", 3)])
  })

  it("uses three reads for a grid of boxes, not three per box", async () => {
    const { result, calls } = load(collectionFixture(), OWNER, [
      BOX.shelf,
      BOX.drawer,
      BOX.tin,
      BOX.empty,
      BOX.plain,
    ])
    expect(Object.keys(await result)).toHaveLength(5)
    expect(calls.map((call) => call.table)).toEqual(["boxes", "items", "value_history"])
  })

  it("skips the history read when no box in scope has items", async () => {
    const { result, calls } = load(collectionFixture(), OWNER, [BOX.empty])
    await result
    expect(calls.map((call) => call.table)).toEqual(["boxes", "items"])
  })

  it("ignores duplicate ids", async () => {
    const { result, calls } = load(collectionFixture(), OWNER, [BOX.plain, BOX.plain])
    expect(Object.keys(await result)).toEqual([BOX.plain])
    expect(calls.map((call) => call.table)).toEqual(["boxes", "items", "value_history"])
  })

  describe("large collections", () => {
    /** One box, one item, one value record a day for `days` days ending today. */
    function longHistory(days: number): FakeTables {
      const itemId = fixtureId("item", 1)
      const start = Date.UTC(2026, 6, 1) - (days - 1) * 86_400_000
      const history: FakeRow[] = Array.from({ length: days }, (_, i) => ({
        id: fixtureId("record", i + 1),
        item_id: itemId,
        value: i + 1,
        recorded_at: new Date(start + i * 86_400_000).toISOString().replace("Z", "+00:00"),
      }))
      return {
        boxes: [{ id: BOX.shelf, user_id: OWNER, parent_box_id: null }],
        items: [
          {
            id: itemId,
            user_id: OWNER,
            box_id: BOX.shelf,
            current_value: days,
            acquisition_date: null,
            acquisition_price: null,
            is_wishlist: false,
          },
        ],
        value_history: history,
      }
    }

    it("reads past the 1000-row response cap", async () => {
      const { result, calls } = load(longHistory(2300), OWNER, [BOX.shelf])
      const series = (await result)[BOX.shelf]
      expect(series.dates).toHaveLength(24)
      expect(series.dates[23]).toBe(FIXTURE_TODAY)
      // The newest record is the 2300th; a single capped read would stop at 1000.
      expect(series.value[23]).toBe(2300)
      expect(series.value[0]).toBe(1)
      expect(calls.filter((call) => call.table === "value_history").map((call) => call.range)).toEqual([
        [0, 999],
        [1000, 1999],
        [2000, 2999],
      ])
    })

    it("still reads everything when the server caps responses below the page size", async () => {
      const { result } = load(longHistory(950), OWNER, [BOX.shelf], { maxRows: 400 })
      const series = (await result)[BOX.shelf]
      expect(series.value[series.value.length - 1]).toBe(950)
      expect(series.value[0]).toBe(1)
    })

    it("splits long id lists across requests", async () => {
      const boxes: FakeRow[] = [{ id: BOX.shelf, user_id: OWNER, parent_box_id: null }]
      const items: FakeRow[] = []
      for (let n = 1; n <= 250; n++) {
        const boxId = fixtureId("box", 1000 + n)
        boxes.push({ id: boxId, user_id: OWNER, parent_box_id: BOX.shelf })
        items.push({
          id: fixtureId("item", n),
          user_id: OWNER,
          box_id: boxId,
          current_value: 2,
          acquisition_date: "2026-05-01",
          acquisition_price: 1,
          is_wishlist: false,
        })
      }
      const { result, calls } = load({ boxes, items, value_history: [] }, OWNER, [BOX.shelf])
      const series = (await result)[BOX.shelf]
      expect(series.currentValue).toBe(500)
      expect(series.totalAcquisition).toBe(250)

      const listSizes = (table: string) =>
        calls
          .filter((call) => call.table === table)
          .map((call) => (call.filters.find((filter) => filter.op === "in")?.value as unknown[]).length)
      // 251 boxes in scope and 250 items, at most 100 ids per filter.
      expect(listSizes("items").sort()).toEqual([100, 100, 51])
      expect(listSizes("value_history").sort()).toEqual([100, 100, 50])
    })
  })

  it.each(["boxes", "items", "value_history"])("throws when the %s read fails", async (table) => {
    const { result } = load(collectionFixture(), OWNER, [BOX.shelf], { failTables: [table] })
    await expect(result).rejects.toEqual({ message: `${table} unavailable` })
  })
})
