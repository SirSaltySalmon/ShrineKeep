import { describe, expect, it } from "vitest"
import {
  buildBoxStats,
  extendAcquisitionToLatestDate,
  mergeStatsSeries,
  filterBoxStatsByDateRange,
  groupValueRecordsByItem,
  statsToday,
  type BoxStatsItemRow,
} from "./box-stats-series"

const TODAY = "2026-07-01"

function item(id: string, fields: Partial<BoxStatsItemRow> = {}): BoxStatsItemRow {
  return { id, current_value: null, acquisition_date: null, acquisition_price: null, ...fields }
}

describe("statsToday", () => {
  it("is the UTC calendar day", () => {
    expect(statsToday(new Date("2026-07-01T23:59:59.000Z"))).toBe("2026-07-01")
    expect(statsToday(new Date("2026-07-02T00:00:00.000Z"))).toBe("2026-07-02")
  })
})

describe("groupValueRecordsByItem", () => {
  it("groups by item, oldest first, and parses numeric strings", () => {
    const grouped = groupValueRecordsByItem([
      { item_id: "a", value: "12.50", recorded_at: "2026-03-01T00:00:00+00:00" },
      { item_id: "b", value: 4, recorded_at: "2026-01-01T00:00:00+00:00" },
      { item_id: "a", value: 10, recorded_at: "2026-02-01T00:00:00+00:00" },
    ])
    expect(grouped.get("a")).toEqual([
      { recorded_at: "2026-02-01T00:00:00+00:00", value: 10 },
      { recorded_at: "2026-03-01T00:00:00+00:00", value: 12.5 },
    ])
    expect(grouped.get("b")).toHaveLength(1)
  })
})

describe("buildBoxStats", () => {
  it("is empty for a scope with no items", () => {
    expect(buildBoxStats([], new Map(), TODAY)).toEqual({
      valueHistory: [],
      acquisitionHistory: [],
      currentValue: 0,
      totalAcquisition: 0,
    })
  })

  it("gives one value point (today) to items that have no history", () => {
    const stats = buildBoxStats([item("a", { current_value: 30 }), item("b", { current_value: 12 })], new Map(), TODAY)
    expect(stats.valueHistory).toEqual([{ date: TODAY, value: 42 }])
    expect(stats.currentValue).toBe(42)
  })

  it("values each item at its latest record on or before the day", () => {
    const records = groupValueRecordsByItem([
      { item_id: "a", value: 10, recorded_at: "2026-01-05T09:00:00+00:00" },
      { item_id: "a", value: 15, recorded_at: "2026-01-05T17:00:00+00:00" },
      { item_id: "a", value: 20, recorded_at: "2026-03-01T00:00:00+00:00" },
      { item_id: "b", value: 100, recorded_at: "2026-02-01T00:00:00+00:00" },
    ])
    const stats = buildBoxStats(
      [item("a", { current_value: 20 }), item("b", { current_value: 100 }), item("c", { current_value: 1 })],
      records,
      TODAY
    )
    expect(stats.valueHistory).toEqual([
      // a: last record of the day (15). b: history starts later, so 0. c: no history, current value.
      { date: "2026-01-05", value: 16 },
      { date: "2026-02-01", value: 116 },
      { date: "2026-03-01", value: 121 },
      { date: TODAY, value: 121 },
    ])
  })

  it("falls back to the current value from today on when every record is in the future", () => {
    const records = groupValueRecordsByItem([
      { item_id: "a", value: 70, recorded_at: "2026-08-01T00:00:00+00:00" },
    ])
    const stats = buildBoxStats([item("a", { current_value: 50 })], records, TODAY)
    expect(stats.valueHistory).toEqual([
      { date: TODAY, value: 50 },
      { date: "2026-08-01", value: 70 },
    ])
  })

  it("ignores records of items outside the scope", () => {
    const records = groupValueRecordsByItem([
      { item_id: "elsewhere", value: 999, recorded_at: "2026-01-01T00:00:00+00:00" },
    ])
    const stats = buildBoxStats([item("a", { current_value: 5 })], records, TODAY)
    expect(stats.valueHistory).toEqual([{ date: TODAY, value: 5 }])
  })

  it("accumulates acquisition cost by day, in date order", () => {
    const stats = buildBoxStats(
      [
        item("a", { acquisition_date: "2026-02-10", acquisition_price: 30 }),
        item("b", { acquisition_date: "2026-01-05", acquisition_price: "12.50" }),
        item("c", { acquisition_date: "2026-02-10", acquisition_price: 7.5 }),
        // Dated but free: adds a point without moving the total.
        item("d", { acquisition_date: "2026-03-01" }),
        // Priced but undated: in the total, not on the line.
        item("e", { acquisition_price: 100 }),
      ],
      new Map(),
      TODAY
    )
    expect(stats.acquisitionHistory).toEqual([
      { date: "2026-01-05", cumulativeAcquisition: 12.5 },
      { date: "2026-02-10", cumulativeAcquisition: 50 },
      { date: "2026-03-01", cumulativeAcquisition: 50 },
    ])
    expect(stats.totalAcquisition).toBe(150)
  })
})

describe("filterBoxStatsByDateRange", () => {
  const stats = {
    valueHistory: [
      { date: "2026-01-01", value: 1 },
      { date: "2026-02-01", value: 2 },
      { date: "2026-03-01", value: 3 },
    ],
    acquisitionHistory: [
      { date: "2026-01-15", cumulativeAcquisition: 5 },
      { date: "2026-02-15", cumulativeAcquisition: 9 },
    ],
    currentValue: 3,
    totalAcquisition: 9,
  }

  it("keeps both ends of the range and leaves totals alone", () => {
    const filtered = filterBoxStatsByDateRange(stats, "2026-02-01", "2026-02-15")
    expect(filtered.valueHistory).toEqual([{ date: "2026-02-01", value: 2 }])
    expect(filtered.acquisitionHistory).toEqual([{ date: "2026-02-15", cumulativeAcquisition: 9 }])
    expect(filtered.currentValue).toBe(3)
    expect(filtered.totalAcquisition).toBe(9)
  })

  it("is a no-op without a range", () => {
    expect(filterBoxStatsByDateRange(stats)).toEqual(stats)
  })
})

describe("extendAcquisitionToLatestDate", () => {
  const cost = [
    { date: "2026-01-01", cumulativeAcquisition: 5 },
    { date: "2026-02-01", cumulativeAcquisition: 9 },
  ]

  it("carries the total forward to the latest value date", () => {
    expect(extendAcquisitionToLatestDate([{ date: "2026-06-01", value: 20 }], cost)).toEqual([
      ...cost,
      { date: "2026-06-01", cumulativeAcquisition: 9 },
    ])
  })

  it("adds nothing when the cost series already ends last", () => {
    expect(extendAcquisitionToLatestDate([{ date: "2026-01-15", value: 20 }], cost)).toEqual(cost)
  })

  it("stays empty when nothing was acquired", () => {
    expect(extendAcquisitionToLatestDate([{ date: "2026-06-01", value: 20 }], [])).toEqual([])
  })

  it("returns a copy, not the input", () => {
    const extended = extendAcquisitionToLatestDate([], cost)
    expect(extended).toEqual(cost)
    expect(extended).not.toBe(cost)
    expect(extended[0]).not.toBe(cost[0])
  })
})

describe("mergeStatsSeries", () => {
  it("is empty when both series are", () => {
    expect(mergeStatsSeries([], [])).toEqual([])
  })

  it("uses every date either series has, in order", () => {
    const merged = mergeStatsSeries(
      [
        { date: "2026-03-01", value: 30 },
        { date: "2026-01-01", value: 10 },
      ],
      [{ date: "2026-02-01", cumulativeAcquisition: 7 }]
    )
    expect(merged.map((p) => p.date)).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"])
  })

  it("zero-fills a series before its first figure", () => {
    expect(
      mergeStatsSeries(
        [{ date: "2026-02-01", value: 10 }],
        [{ date: "2026-01-01", cumulativeAcquisition: 6 }]
      )
    ).toEqual([
      { date: "2026-01-01", value: 0, cumulativeAcquisition: 6 },
      { date: "2026-02-01", value: 10, cumulativeAcquisition: 6 },
    ])
    expect(
      mergeStatsSeries(
        [{ date: "2026-01-01", value: 10 }],
        [{ date: "2026-02-01", cumulativeAcquisition: 6 }]
      )
    ).toEqual([
      { date: "2026-01-01", value: 10, cumulativeAcquisition: 0 },
      { date: "2026-02-01", value: 10, cumulativeAcquisition: 6 },
    ])
  })

  it("carries each series forward between and after its figures", () => {
    expect(
      mergeStatsSeries(
        [
          { date: "2026-01-01", value: 10 },
          { date: "2026-04-01", value: 40 },
        ],
        [
          { date: "2026-02-01", cumulativeAcquisition: 5 },
          { date: "2026-03-01", cumulativeAcquisition: 8 },
          { date: "2026-05-01", cumulativeAcquisition: 9 },
        ]
      )
    ).toEqual([
      { date: "2026-01-01", value: 10, cumulativeAcquisition: 0 },
      { date: "2026-02-01", value: 10, cumulativeAcquisition: 5 },
      { date: "2026-03-01", value: 10, cumulativeAcquisition: 8 },
      { date: "2026-04-01", value: 40, cumulativeAcquisition: 8 },
      { date: "2026-05-01", value: 40, cumulativeAcquisition: 9 },
    ])
  })

  it("keeps a real zero as zero and gives one series a flat zero partner", () => {
    expect(mergeStatsSeries([{ date: "2026-01-01", value: 0 }], [])).toEqual([
      { date: "2026-01-01", value: 0, cumulativeAcquisition: 0 },
    ])
    expect(mergeStatsSeries([], [{ date: "2026-01-01", cumulativeAcquisition: 4 }])).toEqual([
      { date: "2026-01-01", value: 0, cumulativeAcquisition: 4 },
    ])
  })
})
