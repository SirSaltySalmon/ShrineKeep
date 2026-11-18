import type { createSupabaseServerClient } from "@/lib/supabase/server"
import {
  buildBoxSparkline,
  BOX_SPARKLINE_MAX_POINTS,
  type BoxSparklineSeries,
} from "@/lib/stats/box-sparkline"
import {
  buildBoxStats,
  groupValueRecordsByItem,
  statsToday,
  type BoxStatsItemRow,
  type BoxStatsValueRecord,
} from "@/lib/stats/box-stats-series"

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

/** Rows per page. Supabase caps a response at 1000 rows by default. */
const PAGE_SIZE = 1000
/** Ids per `.in()` filter, so the request URL stays well under gateway limits (about 3.7 KB of uuids). */
const IN_CHUNK = 100
/** Chunked reads in flight at once. */
const CONCURRENCY = 4

interface BoxTreeRow {
  id: string
  parent_box_id: string | null
}

type ItemRow = BoxStatsItemRow & { box_id: string | null }

interface Page<T> {
  data: T[] | null
  error: unknown
  count: number | null
}

/**
 * Read every row of a query, page by page. The first page reports the exact
 * total, so a server row cap smaller than `PAGE_SIZE` cannot cut the read short
 * unnoticed. Throws on any error rather than returning a partial set, because a
 * series built from half the history is a wrong chart, not a missing one.
 */
async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<Page<T>>
): Promise<T[]> {
  const rows: T[] = []
  let total: number | null = null
  for (;;) {
    const { data, error, count } = await fetchPage(rows.length, rows.length + PAGE_SIZE - 1)
    if (error) throw error
    const page = data ?? []
    for (const row of page) rows.push(row)
    if (typeof count === "number") total = count
    if (page.length === 0) break
    if (total !== null ? rows.length >= total : page.length < PAGE_SIZE) break
  }
  return rows
}

/** Run `load` over `ids` in chunks of `IN_CHUNK`, a few chunks at a time, and flatten. */
async function loadInChunks<T>(
  ids: readonly string[],
  load: (chunk: string[]) => Promise<T[]>
): Promise<T[]> {
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += IN_CHUNK) chunks.push(ids.slice(i, i + IN_CHUNK))
  const results: T[][] = chunks.map(() => [])
  let next = 0
  const worker = async () => {
    while (next < chunks.length) {
      const index = next++
      results[index] = await load(chunks[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, worker))
  const flat: T[] = []
  for (const rows of results) for (const row of rows) flat.push(row)
  return flat
}

/** `rootId` and every box nested under it, parents before children. Safe against cycles. */
export function collectSubtreeBoxIds(
  childrenByParent: ReadonlyMap<string, readonly string[]>,
  rootId: string
): string[] {
  const seen = new Set<string>([rootId])
  const ordered = [rootId]
  for (let i = 0; i < ordered.length; i++) {
    for (const child of childrenByParent.get(ordered[i]) ?? []) {
      if (seen.has(child)) continue
      seen.add(child)
      ordered.push(child)
    }
  }
  return ordered
}

export interface LoadBoxSparklinesOptions {
  /** Defaults to today (UTC), as in the stats route. */
  today?: string
  maxPoints?: number
}

/**
 * Sparkline series for many boxes in a fixed number of reads, whatever the
 * number of boxes: the owner's box tree, then the collection items of every
 * box in scope, then those items' value history.
 *
 * Each box's series is `buildBoxStats` over the items in that box and all boxes
 * nested under it, which is what `GET /api/boxes/[boxId]/stats` returns with no
 * date range, so a card's sparkline and that box's stats dialog agree.
 *
 * Owner-only: every read is filtered by `userId` on top of RLS (value history
 * is reached only through item ids already filtered that way). Ids that are not
 * the user's boxes are left out of the result without saying why.
 */
export async function loadBoxSparklines(
  supabase: Supabase,
  userId: string,
  boxIds: readonly string[],
  options: LoadBoxSparklinesOptions = {}
): Promise<Record<string, BoxSparklineSeries>> {
  const today = options.today ?? statsToday()
  const maxPoints = options.maxPoints ?? BOX_SPARKLINE_MAX_POINTS
  const requested = Array.from(new Set(boxIds))
  if (requested.length === 0) return {}

  const tree = await fetchAllRows<BoxTreeRow>((from, to) =>
    supabase
      .from("boxes")
      .select("id, parent_box_id", { count: "exact" })
      .eq("user_id", userId)
      .order("id", { ascending: true })
      .range(from, to)
  )

  const owned = new Set<string>()
  const childrenByParent = new Map<string, string[]>()
  for (const box of tree) {
    owned.add(box.id)
    if (!box.parent_box_id) continue
    const siblings = childrenByParent.get(box.parent_box_id)
    if (siblings) siblings.push(box.id)
    else childrenByParent.set(box.parent_box_id, [box.id])
  }

  const roots = requested.filter((id) => owned.has(id))
  if (roots.length === 0) return {}

  const subtreeByRoot = new Map<string, string[]>()
  const scope = new Set<string>()
  for (const root of roots) {
    const subtree = collectSubtreeBoxIds(childrenByParent, root)
    subtreeByRoot.set(root, subtree)
    for (const id of subtree) scope.add(id)
  }

  const items = await loadInChunks<ItemRow>(Array.from(scope), (chunk) =>
    fetchAllRows<ItemRow>((from, to) =>
      supabase
        .from("items")
        .select("id, box_id, current_value, acquisition_date, acquisition_price", {
          count: "exact",
        })
        .eq("user_id", userId)
        .eq("is_wishlist", false)
        .in("box_id", chunk)
        .order("id", { ascending: true })
        .range(from, to)
    )
  )

  const itemsByBox = new Map<string, ItemRow[]>()
  for (const item of items) {
    if (!item.box_id) continue
    const list = itemsByBox.get(item.box_id)
    if (list) list.push(item)
    else itemsByBox.set(item.box_id, [item])
  }

  const records = await loadInChunks<BoxStatsValueRecord>(
    items.map((item) => item.id),
    (chunk) =>
      fetchAllRows<BoxStatsValueRecord>((from, to) =>
        supabase
          .from("value_history")
          .select("item_id, value, recorded_at", { count: "exact" })
          .in("item_id", chunk)
          .order("recorded_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to)
      )
  )
  const recordsByItem = groupValueRecordsByItem(records)

  const sparklines: Record<string, BoxSparklineSeries> = {}
  for (const root of roots) {
    const scoped: ItemRow[] = []
    for (const boxId of subtreeByRoot.get(root) ?? []) {
      for (const item of itemsByBox.get(boxId) ?? []) scoped.push(item)
    }
    sparklines[root] = buildBoxSparkline(buildBoxStats(scoped, recordsByItem, today), maxPoints)
  }
  return sparklines
}
