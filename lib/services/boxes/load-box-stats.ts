import type { createSupabaseServerClient } from "@/lib/supabase/server"
import {
  buildBoxStats,
  groupValueRecordsByItem,
  statsToday,
  type BoxStatsItemRow,
  type BoxStatsSeries,
  type BoxStatsValueRecord,
  type ItemValueRecord,
} from "@/lib/stats/box-stats-series"

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

/** Rows per page. Supabase caps a response at 1000 rows by default. */
const PAGE_SIZE = 1000
/** Ids per `.in()` filter, so the request URL stays well under gateway limits (about 3.7 KB of uuids). */
const IN_CHUNK = 100
/** Chunked reads in flight at once. */
const CONCURRENCY = 4
/** Most rows one paged query may return. Far above any real collection: past it the read fails instead of running without bound. */
export const MAX_ROWS_PER_QUERY = 200_000

/** The scope that covers the whole collection, boxed or not. */
export const ROOT_STATS_SCOPE = "root"

/** The whole collection, or a list of box ids (each with the boxes nested under it). */
export type BoxStatsScope = typeof ROOT_STATS_SCOPE | readonly string[]

interface BoxTreeRow {
  id: string
  parent_box_id: string | null
}

type ItemRow = BoxStatsItemRow & { box_id: string | null }

const ITEM_COLUMNS = "id, box_id, current_value, acquisition_date, acquisition_price"

interface Page<T> {
  data: T[] | null
  error: unknown
  count: number | null
}

/** Pass to `select(columns, { count })`: an exact count on the first page only, where it is used. */
type PageCount = "exact" | undefined

/**
 * Read every row of a query, page by page. The first page reports the exact
 * total, so a server row cap smaller than `PAGE_SIZE` cannot cut the read short
 * unnoticed. Throws on any error rather than returning a partial set, because a
 * series built from half the history is a wrong chart, not a missing one.
 */
async function fetchAllRows<T>(
  fetchPage: (from: number, to: number, count: PageCount) => PromiseLike<Page<T>>
): Promise<T[]> {
  const rows: T[] = []
  let total: number | null = null
  for (;;) {
    const from = rows.length
    const { data, error, count } = await fetchPage(
      from,
      from + PAGE_SIZE - 1,
      from === 0 ? "exact" : undefined
    )
    if (error) throw error
    const page = data ?? []
    for (const row of page) rows.push(row)
    if (from === 0 && typeof count === "number") total = count
    if (Math.max(total ?? 0, rows.length) > MAX_ROWS_PER_QUERY) {
      throw new Error(`Box stats query is over the ${MAX_ROWS_PER_QUERY}-row limit`)
    }
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

/** Value history of `items`, grouped by item. Reached only through ids the caller already filtered by user. */
async function loadValueRecords(
  supabase: Supabase,
  items: readonly ItemRow[]
): Promise<Map<string, ItemValueRecord[]>> {
  const records = await loadInChunks<BoxStatsValueRecord>(
    items.map((item) => item.id),
    (chunk) =>
      fetchAllRows<BoxStatsValueRecord>((from, to, count) =>
        supabase
          .from("value_history")
          .select("item_id, value, recorded_at", { count })
          .in("item_id", chunk)
          .order("recorded_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to)
      )
  )
  return groupValueRecordsByItem(records)
}

export interface LoadBoxStatsSeriesOptions {
  /** Defaults to today (UTC). */
  today?: string
}

/**
 * The owner's stats, all time: the one loader behind the stats route and the
 * box-card sparklines, so the two cannot disagree.
 *
 * Returns a series per scope asked for. `"root"` is the whole collection,
 * including items in no box, under the key `"root"`. A list of box ids gives
 * each box's series (its own items and those of every box nested under it)
 * under its id, in a fixed number of reads whatever the number of boxes: the
 * owner's box tree, then the collection items of every box in scope, then
 * those items' value history.
 *
 * Owner-only: every read is filtered by `userId` on top of RLS (value history
 * is reached only through item ids already filtered that way). Ids that are not
 * the user's boxes are left out of the result without saying why.
 *
 * Throws when a read fails or passes `MAX_ROWS_PER_QUERY`.
 */
export async function loadBoxStatsSeries(
  supabase: Supabase,
  userId: string,
  scope: BoxStatsScope,
  options: LoadBoxStatsSeriesOptions = {}
): Promise<Map<string, BoxStatsSeries>> {
  const today = options.today ?? statsToday()
  const series = new Map<string, BoxStatsSeries>()

  if (scope === ROOT_STATS_SCOPE) {
    const items = await fetchAllRows<ItemRow>((from, to, count) =>
      supabase
        .from("items")
        .select(ITEM_COLUMNS, { count })
        .eq("user_id", userId)
        .eq("is_wishlist", false)
        .order("id", { ascending: true })
        .range(from, to)
    )
    const recordsByItem = await loadValueRecords(supabase, items)
    series.set(ROOT_STATS_SCOPE, buildBoxStats(items, recordsByItem, today))
    return series
  }

  const requested = Array.from(new Set(scope))
  if (requested.length === 0) return series

  const tree = await fetchAllRows<BoxTreeRow>((from, to, count) =>
    supabase
      .from("boxes")
      .select("id, parent_box_id", { count })
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
  if (roots.length === 0) return series

  const subtreeByRoot = new Map<string, string[]>()
  const boxesInScope = new Set<string>()
  for (const root of roots) {
    const subtree = collectSubtreeBoxIds(childrenByParent, root)
    subtreeByRoot.set(root, subtree)
    for (const id of subtree) boxesInScope.add(id)
  }

  const items = await loadInChunks<ItemRow>(Array.from(boxesInScope), (chunk) =>
    fetchAllRows<ItemRow>((from, to, count) =>
      supabase
        .from("items")
        .select(ITEM_COLUMNS, { count })
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

  const recordsByItem = await loadValueRecords(supabase, items)

  for (const root of roots) {
    const scoped: ItemRow[] = []
    for (const boxId of subtreeByRoot.get(root) ?? []) {
      for (const item of itemsByBox.get(boxId) ?? []) scoped.push(item)
    }
    series.set(root, buildBoxStats(scoped, recordsByItem, today))
  }
  return series
}
