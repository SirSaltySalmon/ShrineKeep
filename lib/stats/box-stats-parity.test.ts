import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GET as getBoxStats } from "@/app/api/boxes/[boxId]/stats/route"
import { loadBoxSparklines } from "@/lib/services/boxes/load-box-sparklines"
import { buildBoxSparkline } from "@/lib/stats/box-sparkline"
import {
  buildBoxStats,
  filterBoxStatsByDateRange,
  groupValueRecordsByItem,
  type BoxStatsItemRow,
  type BoxStatsSeries,
  type BoxStatsValueRecord,
} from "@/lib/stats/box-stats-series"
import {
  BOX,
  collectionFixture,
  FIXTURE_NOW,
  FIXTURE_TODAY,
  generatedBoxId,
  generatedCollection,
  OWNER,
  SUBTREE,
} from "@/lib/stats/testing/collection-fixture"
import { createFakeSupabase, type FakeTables } from "@/lib/stats/testing/fake-supabase"

/**
 * The sparkline must show the numbers the stats dialog shows. The dialog's
 * numbers come from `GET /api/boxes/[boxId]/stats`, whose computation is inline
 * in the route. These tests run that real route and the shared module over the
 * same rows, so a change to either that is not mirrored in the other fails here.
 */

const { mockCreateSupabaseServerClient } = vi.hoisted(() => ({
  mockCreateSupabaseServerClient: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}))

type Supabase = Parameters<typeof loadBoxSparklines>[0]

async function statsFromRoute(tables: FakeTables, boxId: string, query = ""): Promise<BoxStatsSeries> {
  mockCreateSupabaseServerClient.mockResolvedValue(createFakeSupabase(tables, { userId: OWNER }).client)
  const response = await getBoxStats(
    new Request(`http://localhost/api/boxes/${boxId}/stats${query}`) as never,
    { params: Promise.resolve({ boxId }) }
  )
  expect(response.status).toBe(200)
  return (await response.json()) as BoxStatsSeries
}

/** The owner's collection items in `boxIds`, and all value history, straight from the tables. */
function rowsFor(tables: FakeTables, boxIds: string[]) {
  const items = tables.items.filter(
    (row) => row.user_id === OWNER && row.is_wishlist === false && boxIds.includes(row.box_id as string)
  ) as unknown as BoxStatsItemRow[]
  const records = tables.value_history as unknown as BoxStatsValueRecord[]
  return { items, recordsByItem: groupValueRecordsByItem(records) }
}

function subtreeOf(tables: FakeTables, rootId: string): string[] {
  const ids = [rootId]
  for (let i = 0; i < ids.length; i++) {
    for (const row of tables.boxes) {
      if (row.parent_box_id === ids[i] && row.user_id === OWNER) ids.push(row.id as string)
    }
  }
  return ids
}

describe("shared box stats match GET /api/boxes/[boxId]/stats", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXTURE_NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it.each(Object.keys(SUBTREE))("box %s: same series and totals", async (boxId) => {
    const tables = collectionFixture()
    const fromRoute = await statsFromRoute(tables, boxId)
    const { items, recordsByItem } = rowsFor(tables, SUBTREE[boxId])
    expect(buildBoxStats(items, recordsByItem, FIXTURE_TODAY)).toEqual(fromRoute)
  })

  it("includes items in nested boxes, as the route does", async () => {
    const fromRoute = await statsFromRoute(collectionFixture(), BOX.shelf)
    // 100 (shelf) + 50.5 (drawer) + 20 (tin); the wishlist row and the stranger's row are out.
    expect(fromRoute.currentValue).toBe(170.5)
    expect(fromRoute.totalAcquisition).toBe(145.25)
  })

  it("applies the same date range filter", async () => {
    const tables = collectionFixture()
    const fromRoute = await statsFromRoute(tables, BOX.shelf, "?fromDate=2026-02-01&toDate=2026-06-15")
    const { items, recordsByItem } = rowsFor(tables, SUBTREE[BOX.shelf])
    const shared = filterBoxStatsByDateRange(
      buildBoxStats(items, recordsByItem, FIXTURE_TODAY),
      "2026-02-01",
      "2026-06-15"
    )
    expect(shared).toEqual(fromRoute)
    expect(fromRoute.valueHistory.map((p) => p.date)).toEqual(["2026-02-01", "2026-03-01", "2026-06-15"])
  })

  it.each([11, 29, 47])("generated collection (seed %i): every box matches", async (seed) => {
    const tables = generatedCollection(seed, 9, 60)
    for (let n = 1; n <= 9; n++) {
      const boxId = generatedBoxId(n)
      const fromRoute = await statsFromRoute(tables, boxId)
      const { items, recordsByItem } = rowsFor(tables, subtreeOf(tables, boxId))
      expect(buildBoxStats(items, recordsByItem, FIXTURE_TODAY)).toEqual(fromRoute)
    }
  })

  it("the batched loader's sparkline is the route's response, sampled", async () => {
    const tables = generatedCollection(5, 9, 60)
    const boxIds = Array.from({ length: 9 }, (_, i) => generatedBoxId(i + 1))
    const { client } = createFakeSupabase(tables, { userId: OWNER })
    const sparklines = await loadBoxSparklines(client as unknown as Supabase, OWNER, boxIds)

    expect(Object.keys(sparklines).sort()).toEqual([...boxIds].sort())
    for (const boxId of boxIds) {
      const fromRoute = await statsFromRoute(tables, boxId)
      expect(sparklines[boxId]).toEqual(buildBoxSparkline(fromRoute))
    }
    // The root box of the generated tree covers every item, so it must be sampled down.
    expect(sparklines[generatedBoxId(1)].dates).toHaveLength(24)
  })
})
