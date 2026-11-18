import type { AcquisitionPoint, ValuePoint } from "@/lib/hooks/use-box-stats"

/**
 * Owner box stats, as pure functions.
 *
 * This is the same computation `GET /api/boxes/[boxId]/stats` runs inline
 * (`app/api/boxes/[boxId]/stats/route.ts`), lifted out so a second caller (the
 * batched sparkline route) cannot drift into its own definition of "value over
 * time". `box-stats-parity.test.ts` runs that route and this module over the
 * same rows and fails if the two ever disagree.
 *
 * Nothing here touches the database: callers load the rows (collection items in
 * the box and every box nested under it, plus their value history) and pass
 * them in.
 */

/** The item columns the stats read. Numerics may arrive as numbers or numeric strings. */
export interface BoxStatsItemRow {
  id: string
  current_value: number | string | null
  acquisition_date: string | null
  acquisition_price: number | string | null
}

export interface BoxStatsValueRecord {
  item_id: string
  value: number | string
  recorded_at: string
}

export interface ItemValueRecord {
  recorded_at: string
  value: number
}

export interface BoxStatsSeries {
  /** One point per day any item in scope recorded a value, plus today. Ascending. */
  valueHistory: ValuePoint[]
  /** Running acquisition total, one point per acquisition day. Ascending. */
  acquisitionHistory: AcquisitionPoint[]
  currentValue: number
  totalAcquisition: number
}

/** Today as the stats route sees it: the UTC calendar day. */
export function statsToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/** Group value history by item, each item's records oldest first. */
export function groupValueRecordsByItem(
  records: readonly BoxStatsValueRecord[]
): Map<string, ItemValueRecord[]> {
  const byItem = new Map<string, ItemValueRecord[]>()
  for (const record of records) {
    let list = byItem.get(record.item_id)
    if (!list) {
      list = []
      byItem.set(record.item_id, list)
    }
    list.push({
      recorded_at: record.recorded_at,
      value: parseFloat(String(record.value)),
    })
  }
  byItem.forEach((list) => {
    list.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
  })
  return byItem
}

/**
 * Value and acquisition series for one scope.
 *
 * @param items collection items in scope (the box and all boxes nested in it)
 * @param recordsByItem value history from `groupValueRecordsByItem`; records of
 *   items outside `items` are ignored, so one map can serve many scopes
 * @param today `statsToday()`
 */
export function buildBoxStats(
  items: readonly BoxStatsItemRow[],
  recordsByItem: ReadonlyMap<string, readonly ItemValueRecord[]>,
  today: string
): BoxStatsSeries {
  if (items.length === 0) {
    return { valueHistory: [], acquisitionHistory: [], currentValue: 0, totalAcquisition: 0 }
  }

  const currentValue = items.reduce((sum, item) => sum + (Number(item.current_value) || 0), 0)
  const totalAcquisition = items.reduce(
    (sum, item) => sum + (item.acquisition_price != null ? Number(item.acquisition_price) : 0),
    0
  )

  const allDates = new Set<string>([today])
  for (const item of items) {
    for (const record of recordsByItem.get(item.id) ?? []) {
      allDates.add(record.recorded_at.slice(0, 10))
    }
  }
  const sortedDates = Array.from(allDates).sort()

  // An item is worth its latest record on or before the day. An item with no
  // history at all counts at its current value on every day; one whose history
  // starts later counts as 0 until then.
  const totals: number[] = sortedDates.map(() => 0)
  for (const item of items) {
    const fallback = Number(item.current_value ?? 0)
    const records = recordsByItem.get(item.id)
    let next = 0
    let latest: number | null = null
    for (let d = 0; d < sortedDates.length; d++) {
      const date = sortedDates[d]
      if (!records || records.length === 0) {
        totals[d] += fallback
        continue
      }
      const endOfDay = date + "T23:59:59.999Z"
      while (next < records.length && records[next].recorded_at <= endOfDay) {
        latest = records[next].value
        next++
      }
      totals[d] += latest !== null ? latest : date >= today ? fallback : 0
    }
  }
  const valueHistory: ValuePoint[] = sortedDates.map((date, d) => ({ date, value: totals[d] }))

  const acquisitionEntries = items
    .filter((item) => item.acquisition_date)
    .map((item) => ({
      date: item.acquisition_date as string,
      price: Number(item.acquisition_price) || 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const byDate = new Map<string, number>()
  let cumulative = 0
  for (const entry of acquisitionEntries) {
    cumulative += entry.price
    byDate.set(entry.date.slice(0, 10), cumulative)
  }
  const acquisitionHistory: AcquisitionPoint[] = Array.from(byDate.entries())
    .map(([date, cumulativeAcquisition]) => ({ date, cumulativeAcquisition }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return { valueHistory, acquisitionHistory, currentValue, totalAcquisition }
}

/**
 * Carry the acquisition total forward to the latest date either series reaches, so the cost
 * line ends where the value line does. Same step `useBoxStats` applies before charting.
 */
export function extendAcquisitionToLatestDate(
  valueHistory: readonly ValuePoint[],
  acquisitionHistory: readonly AcquisitionPoint[]
): AcquisitionPoint[] {
  const base = acquisitionHistory.map((p) => ({
    date: p.date,
    cumulativeAcquisition: p.cumulativeAcquisition,
  }))
  const allDates = [...valueHistory.map((p) => p.date), ...acquisitionHistory.map((p) => p.date)].filter(Boolean)
  if (allDates.length === 0 || base.length === 0) return base
  const endDate = allDates.reduce((a, b) => (a >= b ? a : b))
  const last = base[base.length - 1]
  if (last.date < endDate) {
    return [...base, { date: endDate, cumulativeAcquisition: last.cumulativeAcquisition }]
  }
  return base
}

/** One row per date with both figures: what a chart of the two series draws. */
export interface MergedStatsPoint {
  date: string
  value: number
  cumulativeAcquisition: number
}

/**
 * Put both series on one shared set of dates (every date either has), with no gaps:
 * on each date a series shows its latest figure on or before that date, and 0 before its
 * first figure (the "zero fill"). Nothing was owned or valued yet, so 0 is the true figure,
 * and it gives both lines the same start and end.
 *
 * The overlay chart, the two separate charts and the box-card sparkline all draw this, so a
 * box looks the same wherever it is graphed.
 */
export function mergeStatsSeries(
  valueData: readonly ValuePoint[],
  acquisitionData: readonly AcquisitionPoint[]
): MergedStatsPoint[] {
  const dates = Array.from(
    new Set([...valueData.map((p) => p.date), ...acquisitionData.map((p) => p.date)])
  )
    .filter(Boolean)
    .sort()
  if (dates.length === 0) return []

  const values = [...valueData].sort((a, b) => a.date.localeCompare(b.date))
  const acquisitions = [...acquisitionData].sort((a, b) => a.date.localeCompare(b.date))
  let v = 0
  let a = 0
  let value = 0
  let cumulativeAcquisition = 0
  return dates.map((date) => {
    while (v < values.length && values[v].date <= date) value = Number(values[v++].value)
    while (a < acquisitions.length && acquisitions[a].date <= date) {
      cumulativeAcquisition = Number(acquisitions[a++].cumulativeAcquisition)
    }
    return { date, value, cumulativeAcquisition }
  })
}

/** The route's `fromDate` / `toDate` filter (inclusive, YYYY-MM-DD). Totals are not filtered. */
export function filterBoxStatsByDateRange(
  stats: BoxStatsSeries,
  fromDate?: string,
  toDate?: string
): BoxStatsSeries {
  let { valueHistory, acquisitionHistory } = stats
  if (fromDate) {
    valueHistory = valueHistory.filter((p) => p.date >= fromDate)
    acquisitionHistory = acquisitionHistory.filter((p) => p.date >= fromDate)
  }
  if (toDate) {
    valueHistory = valueHistory.filter((p) => p.date <= toDate)
    acquisitionHistory = acquisitionHistory.filter((p) => p.date <= toDate)
  }
  return { ...stats, valueHistory, acquisitionHistory }
}
