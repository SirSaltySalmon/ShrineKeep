import { describe, expect, it } from "vitest"
import { loadBoxStatsSeries, MAX_ROWS_PER_QUERY, type BoxStatsScope } from "./load-box-stats"
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

// Paging, id chunking, ownership filters and read failures for the box scope are
// covered through `loadBoxSparklines` in load-box-sparklines.test.ts.

type Supabase = Parameters<typeof loadBoxStatsSeries>[0]

function load(tables: FakeTables, userId: string, scope: BoxStatsScope, options: FakeSupabaseOptions = {}) {
  const fake = createFakeSupabase(tables, { userId, ...options })
  const result = loadBoxStatsSeries(fake.client as unknown as Supabase, userId, scope, {
    today: FIXTURE_TODAY,
  })
  return { result, calls: fake.calls }
}

/** `count` value records for one item in `BOX.shelf`, a minute apart, worth 1, 2, ... `count`. */
function oneItemWithHistory(count: number): FakeTables {
  const itemId = fixtureId("item", 1)
  const start = Date.UTC(2026, 0, 1)
  const history: FakeRow[] = Array.from({ length: count }, (_, i) => ({
    id: fixtureId("record", i + 1),
    item_id: itemId,
    value: i + 1,
    recorded_at: new Date(start + i * 60_000).toISOString().replace("Z", "+00:00"),
  }))
  return {
    boxes: [{ id: BOX.shelf, user_id: OWNER, parent_box_id: null }],
    items: [
      {
        id: itemId,
        user_id: OWNER,
        box_id: BOX.shelf,
        current_value: count,
        acquisition_date: null,
        acquisition_price: null,
        is_wishlist: false,
      },
    ],
    value_history: history,
  }
}

describe("loadBoxStatsSeries", () => {
  it("returns the full series for each owned box asked for, keyed by id", async () => {
    const { result } = load(collectionFixture(), OWNER, [BOX.drawer, BOX.strangers, BOX.empty])
    const series = await result
    expect(Array.from(series.keys())).toEqual([BOX.drawer, BOX.empty])
    expect(series.get(BOX.drawer)).toEqual({
      valueHistory: [
        { date: "2026-02-01", value: 80.25 },
        { date: "2026-06-15", value: 70.5 },
        { date: FIXTURE_TODAY, value: 70.5 },
      ],
      acquisitionHistory: [{ date: "2026-02-01", cumulativeAcquisition: 60.25 }],
      currentValue: 70.5,
      totalAcquisition: 65.25,
    })
    expect(series.get(BOX.empty)).toEqual({
      valueHistory: [],
      acquisitionHistory: [],
      currentValue: 0,
      totalAcquisition: 0,
    })
  })

  it("reads nothing for an empty list of boxes", async () => {
    const { result, calls } = load(collectionFixture(), OWNER, [])
    expect((await result).size).toBe(0)
    expect(calls).toEqual([])
  })

  describe("root scope", () => {
    it("covers every collection item of the user, boxed or loose", async () => {
      const { result } = load(collectionFixture(), OWNER, "root")
      const series = await result
      expect(Array.from(series.keys())).toEqual(["root"])
      // 100 + 50.5 + 20 in the shelf chain, 10 in the plain box, 7 loose. No wishlist, no stranger.
      expect(series.get("root")?.currentValue).toBe(187.5)
      expect(series.get("root")?.totalAcquisition).toBe(152.25)
      // The loose item's history (Mar 3) is on the line.
      expect(series.get("root")?.valueHistory.map((p) => p.date)).toEqual([
        "2026-01-10",
        "2026-02-01",
        "2026-03-01",
        "2026-03-03",
        "2026-06-15",
        FIXTURE_TODAY,
      ])
    })

    it("is scoped to the user it is called for", async () => {
      const { result } = load(collectionFixture(), STRANGER, "root")
      // The stranger's two items: 500 and the 4000 one parked in the owner's box.
      expect((await result).get("root")?.currentValue).toBe(4500)
    })

    it("is an empty series for a user with no items", async () => {
      const { result, calls } = load({ boxes: [], items: [], value_history: [] }, OWNER, "root")
      expect((await result).get("root")).toEqual({
        valueHistory: [],
        acquisitionHistory: [],
        currentValue: 0,
        totalAcquisition: 0,
      })
      expect(calls.map((call) => call.table)).toEqual(["items"])
    })

    it("pages through more items than one response holds", async () => {
      const items: FakeRow[] = Array.from({ length: 2500 }, (_, i) => ({
        id: fixtureId("item", i + 1),
        user_id: OWNER,
        box_id: null,
        current_value: 1,
        acquisition_date: null,
        acquisition_price: 2,
        is_wishlist: false,
      }))
      const { result } = load({ boxes: [], items, value_history: [] }, OWNER, "root")
      const stats = (await result).get("root")
      expect(stats?.currentValue).toBe(2500)
      expect(stats?.totalAcquisition).toBe(5000)
    })
  })

  it("asks for the exact count on the first page of a read only", async () => {
    const { result, calls } = load(oneItemWithHistory(2300), OWNER, [BOX.shelf])
    await result
    expect(
      calls
        .filter((call) => call.table === "value_history")
        .map((call) => [call.range?.[0], call.exactCount])
    ).toEqual([
      [0, true],
      [1000, false],
      [2000, false],
    ])
  })

  it("refuses a read over the row ceiling instead of paging without bound", async () => {
    const { result, calls } = load(oneItemWithHistory(MAX_ROWS_PER_QUERY + 1), OWNER, [BOX.shelf])
    await expect(result).rejects.toThrow(`over the ${MAX_ROWS_PER_QUERY}-row limit`)
    // The first page's count is enough to stop: no further pages are read.
    expect(calls.filter((call) => call.table === "value_history")).toHaveLength(1)
  })
})
