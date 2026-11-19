import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GET } from "./route"
import {
  BOX,
  collectionFixture,
  fixtureId,
  FIXTURE_NOW,
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

const { mockCreateSupabaseServerClient } = vi.hoisted(() => ({
  mockCreateSupabaseServerClient: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}))

/** Call the route as `userId` over an in-memory database. */
async function getStats(
  tables: FakeTables,
  boxId: string,
  { query = "", userId = OWNER, ...options }: FakeSupabaseOptions & { query?: string } = {}
) {
  const fake = createFakeSupabase(tables, { userId, ...options })
  mockCreateSupabaseServerClient.mockResolvedValue(fake.client)
  const response = await GET(
    new Request(`http://localhost/api/boxes/${boxId}/stats${query}`) as never,
    { params: Promise.resolve({ boxId }) }
  )
  return { response, calls: fake.calls }
}

describe("GET /api/boxes/[boxId]/stats", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXTURE_NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("returns 401 when unauthenticated", async () => {
    const { response, calls } = await getStats(collectionFixture(), "root", { userId: null })
    expect(response.status).toBe(401)
    expect(calls).toEqual([])
  })

  it("returns 400 when boxId is empty", async () => {
    const { response } = await getStats(collectionFixture(), "")
    expect(response.status).toBe(400)
  })

  it("returns a box's series and totals, nested boxes included", async () => {
    const { response } = await getStats(collectionFixture(), BOX.shelf)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      // shelf item (80, 90, 100) + drawer item (60.25, 50.5 from Feb) + tin item (20, no history).
      valueHistory: [
        { date: "2026-01-10", value: 100 },
        { date: "2026-02-01", value: 160.25 },
        { date: "2026-03-01", value: 170.25 },
        { date: "2026-06-15", value: 170.5 },
        { date: FIXTURE_TODAY, value: 170.5 },
      ],
      acquisitionHistory: [
        { date: "2026-01-10", cumulativeAcquisition: 80 },
        { date: "2026-02-01", cumulativeAcquisition: 140.25 },
      ],
      // The wishlist row (999) and the stranger's row parked in this box (4000) are out.
      currentValue: 170.5,
      // Includes the tin item's 5, which has no acquisition date and so no point on the line.
      totalAcquisition: 145.25,
    })
  })

  it("accepts a box id in upper case", async () => {
    const { response } = await getStats(collectionFixture(), BOX.drawer.toUpperCase())
    expect(response.status).toBe(200)
    expect((await response.json()).currentValue).toBe(70.5)
  })

  it("returns empty series for a box with no items", async () => {
    const { response } = await getStats(collectionFixture(), BOX.empty)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      valueHistory: [],
      acquisitionHistory: [],
      currentValue: 0,
      totalAcquisition: 0,
    })
  })

  it("covers the whole collection for root, items in no box included", async () => {
    const { response, calls } = await getStats(collectionFixture(), "root")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      // The shelf chain, plus the plain box's bare item (10) and the loose item (7 from Mar 3).
      valueHistory: [
        { date: "2026-01-10", value: 110 },
        { date: "2026-02-01", value: 170.25 },
        { date: "2026-03-01", value: 180.25 },
        { date: "2026-03-03", value: 187.25 },
        { date: "2026-06-15", value: 187.5 },
        { date: FIXTURE_TODAY, value: 187.5 },
      ],
      acquisitionHistory: [
        { date: "2026-01-10", cumulativeAcquisition: 80 },
        { date: "2026-02-01", cumulativeAcquisition: 140.25 },
        { date: "2026-03-03", cumulativeAcquisition: 147.25 },
      ],
      currentValue: 187.5,
      totalAcquisition: 152.25,
    })
    // Root needs no box tree: the user's items, then their history.
    expect(calls.map((call) => call.table)).toEqual(["items", "value_history"])
    expect(calls[0].filters).toEqual([
      { op: "eq", column: "user_id", value: OWNER },
      { op: "eq", column: "is_wishlist", value: false },
    ])
  })

  it("narrows the series to a date range, opening on the figures carried into it", async () => {
    const { response } = await getStats(collectionFixture(), BOX.shelf, {
      query: "?fromDate=2026-02-15&toDate=2026-06-20",
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      valueHistory: [
        { date: "2026-02-15", value: 160.25 },
        { date: "2026-03-01", value: 170.25 },
        { date: "2026-06-15", value: 170.5 },
      ],
      acquisitionHistory: [{ date: "2026-02-15", cumulativeAcquisition: 140.25 }],
      // Totals are all-time whatever the range.
      currentValue: 170.5,
      totalAcquisition: 145.25,
    })
  })

  it.each([
    ["another user's box", BOX.strangers],
    ["an unknown box", fixtureId("box", 777)],
    ["an id that is not a uuid", "not-a-box"],
    ["an object property name", "constructor"],
    ["root in another case", "ROOT"],
  ])("returns 404 for %s", async (_name, boxId) => {
    const { response } = await getStats(collectionFixture(), boxId)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: "Box not found" })
  })

  it.each(["?fromDate=yesterday", "?toDate=2026-6-1", "?fromDate=2026-02-15&toDate=nope"])(
    "returns 400 for a malformed date range (%s)",
    async (query) => {
      const { response, calls } = await getStats(collectionFixture(), BOX.shelf, { query })
      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({ error: "fromDate and toDate must be YYYY-MM-DD" })
      // Rejected before any read.
      expect(calls).toEqual([])
    }
  )

  it("treats an empty date parameter as not set", async () => {
    const { response } = await getStats(collectionFixture(), BOX.shelf, { query: "?fromDate=&toDate=" })
    expect(response.status).toBe(200)
  })

  it("gives another user nothing from the owner's box", async () => {
    const { response } = await getStats(collectionFixture(), BOX.shelf, { userId: STRANGER })
    expect(response.status).toBe(404)
  })

  it("reads history past the 1000-row response cap", async () => {
    // One item with a value record a day for 2300 days ending today, worth 1, 2, ... 2300.
    const days = 2300
    const itemId = fixtureId("item", 1)
    const start = FIXTURE_NOW.getTime() - (days - 1) * 86_400_000
    const history: FakeRow[] = Array.from({ length: days }, (_, i) => ({
      id: fixtureId("record", i + 1),
      item_id: itemId,
      value: i + 1,
      recorded_at: new Date(start + i * 86_400_000).toISOString().replace("Z", "+00:00"),
    }))
    const tables: FakeTables = {
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

    const { response, calls } = await getStats(tables, BOX.shelf)
    expect(response.status).toBe(200)
    const stats = await response.json()
    expect(stats.valueHistory).toHaveLength(days)
    expect(stats.valueHistory[0]).toEqual({ date: "2020-03-15", value: 1 })
    // A single capped read would stop at the 1000th record.
    expect(stats.valueHistory[days - 1]).toEqual({ date: FIXTURE_TODAY, value: days })
    expect(calls.filter((call) => call.table === "value_history").map((call) => call.range)).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ])
  })

  it.each([
    ["boxes", BOX.shelf],
    ["items", BOX.shelf],
    ["value_history", BOX.shelf],
    ["items", "root"],
    ["value_history", "root"],
  ])("returns 500 without the cause when the %s read fails (%s)", async (table, boxId) => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    const { response } = await getStats(collectionFixture(), boxId, { failTables: [table] })
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: "Failed to load box stats" })
    expect(logged).toHaveBeenCalledWith("Error loading box stats:", { message: `${table} unavailable` })
  })
})
