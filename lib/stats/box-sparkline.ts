import {
  extendAcquisitionToLatestDate,
  mergeStatsSeries,
  type BoxStatsSeries,
} from "@/lib/stats/box-stats-series"

/**
 * The box-card sparkline: wire format, sampling and drawing geometry.
 * Pure and dependency-free so the route, the hook and the component share it.
 */

/** Most points a sparkline series carries. */
export const BOX_SPARKLINE_MAX_POINTS = 24

/** Most boxes one `POST /api/boxes/sparklines` request may ask for. */
export const BOX_SPARKLINE_MAX_BOXES = 100

/**
 * One box's sparkline. Columnar to keep the payload small: `value[i]` and
 * `acquisition[i]` are the figures on `dates[i]`.
 */
export interface BoxSparklineSeries {
  /** YYYY-MM-DD, ascending, no repeats. Empty when the box (and its sub-boxes) holds no items. */
  dates: string[]
  /** Total value on each date. Same length as `dates`. */
  value: number[]
  /**
   * Cumulative acquisition cost on each date. Same length as `dates`, or empty
   * when no item in scope has an acquisition date (the full chart draws no
   * cost line then either).
   */
  acquisition: number[]
  /** Same figure as the stats panel's "Value". */
  currentValue: number
  /** Same figure as the stats panel's "Cost". */
  totalAcquisition: number
}

export interface BoxSparklinesResponse {
  /** Keyed by box id. Ids the caller does not own are left out. */
  sparklines: Record<string, BoxSparklineSeries>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isBoxSparklineId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value)
}

export type ParsedSparklineRequest =
  | { ok: true; boxIds: string[] }
  | { ok: false; error: string }

/** Validate a request body: `{ boxIds: string[] }`, 1 to `BOX_SPARKLINE_MAX_BOXES` UUIDs. Returns them lower-cased and de-duplicated. */
export function parseSparklineRequest(body: unknown): ParsedSparklineRequest {
  const boxIds =
    body !== null && typeof body === "object" && !Array.isArray(body)
      ? (body as { boxIds?: unknown }).boxIds
      : undefined
  if (!Array.isArray(boxIds) || boxIds.length === 0) {
    return { ok: false, error: "boxIds array is required" }
  }
  if (boxIds.length > BOX_SPARKLINE_MAX_BOXES) {
    return { ok: false, error: `At most ${BOX_SPARKLINE_MAX_BOXES} boxIds per request` }
  }
  const unique: string[] = []
  const seen = new Set<string>()
  for (const id of boxIds) {
    if (!isBoxSparklineId(id)) {
      return { ok: false, error: "boxIds must be box ids" }
    }
    // Postgres hands uuids back in lower case; match that so lookups line up.
    const key = id.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(key)
  }
  return { ok: true, boxIds: unique }
}

/**
 * Which of `length` points to keep so at most `maxPoints` remain: evenly spaced
 * by position, always including the first and the last. Every kept point is a
 * real point of the series, so the sparkline ends on the same figure as the
 * full chart.
 */
export function pickSampleIndices(length: number, maxPoints: number = BOX_SPARKLINE_MAX_POINTS): number[] {
  if (length <= 0) return []
  const limit = Math.max(2, Math.floor(maxPoints))
  if (length <= limit) return Array.from({ length }, (_, i) => i)
  const step = (length - 1) / (limit - 1)
  return Array.from({ length: limit }, (_, k) => Math.round(k * step))
}

function toCents(amount: number): number {
  const rounded = Math.round(amount * 100) / 100
  return Number.isFinite(rounded) ? rounded : 0
}

/**
 * Stats (all time, no date filter) to a sparkline: the overlay chart's merged
 * series, sampled down. Amounts are rounded to cents, which only strips
 * floating-point noise from sums of two-decimal prices.
 */
export function buildBoxSparkline(
  stats: BoxStatsSeries,
  maxPoints: number = BOX_SPARKLINE_MAX_POINTS
): BoxSparklineSeries {
  const acquisitionChartData = extendAcquisitionToLatestDate(
    stats.valueHistory,
    stats.acquisitionHistory
  )
  const merged = mergeStatsSeries(stats.valueHistory, acquisitionChartData)
  const kept = pickSampleIndices(merged.length, maxPoints).map((i) => merged[i])
  const hasAcquisition = stats.acquisitionHistory.length > 0
  return {
    dates: kept.map((p) => p.date),
    value: kept.map((p) => toCents(p.value)),
    acquisition: hasAcquisition ? kept.map((p) => toCents(p.cumulativeAcquisition)) : [],
    currentValue: toCents(stats.currentValue),
    totalAcquisition: toCents(stats.totalAcquisition),
  }
}

export interface SparklineGeometry {
  /** SVG `points` for the value polyline. */
  value: string
  /** SVG `points` for the acquisition polyline, or null when there is no cost line. */
  acquisition: string | null
  /** y of the zero line. */
  baselineY: number
}

/**
 * Lay a series out in a `width` x `height` box. x is proportional to time, as
 * on the full chart. y is one shared scale for both lines, starting at 0 (the
 * full chart's y axis does too), so the gap between value and cost reads true.
 * Returns null when there are fewer than two points to join.
 */
export function sparklineGeometry(
  series: Pick<BoxSparklineSeries, "dates" | "value" | "acquisition"> | null | undefined,
  width: number,
  height: number,
  padY: number = 2
): SparklineGeometry | null {
  if (!series) return null
  const count = Math.min(series.dates.length, series.value.length)
  if (count < 2) return null
  const hasAcquisition = series.acquisition.length >= count

  const times = series.dates.slice(0, count).map((date) => Date.parse(date))
  const start = times[0]
  const span = times[count - 1] - start
  const byTime = Number.isFinite(span) && span > 0 && times.every((t) => Number.isFinite(t))
  const x = (i: number) => (byTime ? ((times[i] - start) / span) * width : (i / (count - 1)) * width)

  const figures = series.value.slice(0, count)
  if (hasAcquisition) figures.push(...series.acquisition.slice(0, count))
  const finite = figures.filter((n) => Number.isFinite(n))
  const min = Math.min(0, ...finite)
  const max = Math.max(0, ...finite)
  const range = max - min || 1
  const inner = Math.max(1, height - padY * 2)
  const y = (amount: number) =>
    padY + inner - (((Number.isFinite(amount) ? amount : 0) - min) / range) * inner

  const line = (amounts: readonly number[]) =>
    amounts
      .slice(0, count)
      .map((amount, i) => `${round(x(i))},${round(y(amount))}`)
      .join(" ")

  return {
    value: line(series.value),
    acquisition: hasAcquisition ? line(series.acquisition) : null,
    baselineY: round(y(0)),
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
