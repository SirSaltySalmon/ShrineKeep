import { describe, expect, it } from "vitest"
import {
  BOX_SPARKLINE_MAX_BOXES,
  BOX_SPARKLINE_MAX_POINTS,
  buildBoxSparkline,
  isBoxSparklineId,
  parseSparklineRequest,
  pickSampleIndices,
  sparklineGeometry,
} from "./box-sparkline"
import type { BoxStatsSeries } from "./box-stats-series"

const ID_A = "0b9f6a52-6c1e-4b7e-9a51-3f2f1c0d4e5a"
const ID_B = "7d3c2b1a-0f9e-4d8c-8b7a-6e5d4c3b2a19"

function day(offset: number): string {
  return new Date(Date.UTC(2026, 0, 1) + offset * 86_400_000).toISOString().slice(0, 10)
}

describe("parseSparklineRequest", () => {
  it("accepts a list of box ids", () => {
    expect(parseSparklineRequest({ boxIds: [ID_A, ID_B] })).toEqual({ ok: true, boxIds: [ID_A, ID_B] })
  })

  it("lower-cases and de-duplicates", () => {
    expect(parseSparklineRequest({ boxIds: [ID_A, ID_A.toUpperCase(), ID_B] })).toEqual({
      ok: true,
      boxIds: [ID_A, ID_B],
    })
  })

  it.each([
    ["no body", null],
    ["an array body", [ID_A]],
    ["a missing list", {}],
    ["a list that is not an array", { boxIds: ID_A }],
    ["an empty list", { boxIds: [] }],
  ])("rejects %s", (_name, body) => {
    expect(parseSparklineRequest(body)).toEqual({ ok: false, error: "boxIds array is required" })
  })

  it.each([
    ["the root scope", "root"],
    ["a number", 7],
    ["null", null],
    ["a uuid with trailing text", `${ID_A}'; drop table boxes; --`],
    ["a filter fragment", "a,b)"],
  ])("rejects a list containing %s", (_name, bad) => {
    expect(parseSparklineRequest({ boxIds: [ID_A, bad] })).toEqual({
      ok: false,
      error: "boxIds must be box ids",
    })
  })

  it("caps the number of ids", () => {
    const ids = Array.from(
      { length: BOX_SPARKLINE_MAX_BOXES + 1 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`
    )
    expect(parseSparklineRequest({ boxIds: ids.slice(0, BOX_SPARKLINE_MAX_BOXES) }).ok).toBe(true)
    expect(parseSparklineRequest({ boxIds: ids })).toEqual({
      ok: false,
      error: `At most ${BOX_SPARKLINE_MAX_BOXES} boxIds per request`,
    })
  })
})

describe("isBoxSparklineId", () => {
  it("is true only for uuids", () => {
    expect(isBoxSparklineId(ID_A)).toBe(true)
    expect(isBoxSparklineId("box-skeleton-1")).toBe(false)
    expect(isBoxSparklineId(undefined)).toBe(false)
  })
})

describe("pickSampleIndices", () => {
  it("keeps everything when the series is short enough", () => {
    expect(pickSampleIndices(0, 24)).toEqual([])
    expect(pickSampleIndices(1, 24)).toEqual([0])
    expect(pickSampleIndices(5, 24)).toEqual([0, 1, 2, 3, 4])
    expect(pickSampleIndices(24, 24)).toHaveLength(24)
  })

  it("samples evenly and always keeps the first and last point", () => {
    expect(pickSampleIndices(10, 4)).toEqual([0, 3, 6, 9])
    expect(pickSampleIndices(11, 3)).toEqual([0, 5, 10])
  })

  it.each([25, 26, 47, 48, 100, 365, 5000])("returns %i points as 24 distinct ascending indices", (length) => {
    const indices = pickSampleIndices(length)
    expect(indices).toHaveLength(BOX_SPARKLINE_MAX_POINTS)
    expect(indices[0]).toBe(0)
    expect(indices[indices.length - 1]).toBe(length - 1)
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1])
    }
  })

  it("never returns fewer than two points for a longer series", () => {
    expect(pickSampleIndices(10, 1)).toEqual([0, 9])
    expect(pickSampleIndices(10, 0)).toEqual([0, 9])
  })
})

describe("buildBoxSparkline", () => {
  const empty: BoxStatsSeries = {
    valueHistory: [],
    acquisitionHistory: [],
    currentValue: 0,
    totalAcquisition: 0,
  }

  it("is empty for a box with no items", () => {
    expect(buildBoxSparkline(empty)).toEqual({
      dates: [],
      value: [],
      acquisition: [],
      currentValue: 0,
      totalAcquisition: 0,
    })
  })

  it("puts both series on shared dates, zero-filled before they start and carried forward after", () => {
    const sparkline = buildBoxSparkline({
      valueHistory: [
        { date: "2026-02-01", value: 10 },
        { date: "2026-07-01", value: 14 },
      ],
      acquisitionHistory: [{ date: "2026-01-01", cumulativeAcquisition: 6 }],
      currentValue: 14,
      totalAcquisition: 6,
    })
    expect(sparkline).toEqual({
      dates: ["2026-01-01", "2026-02-01", "2026-07-01"],
      // Nothing was valued on the purchase day yet: 0, as the overlay chart draws it.
      value: [0, 10, 14],
      // One purchase, carried to the latest date so the cost line ends with the value line.
      acquisition: [6, 6, 6],
      currentValue: 14,
      totalAcquisition: 6,
    })
  })

  it("starts the cost line at zero when value history begins before the first purchase", () => {
    const sparkline = buildBoxSparkline({
      valueHistory: [
        { date: "2026-01-01", value: 10 },
        { date: "2026-03-01", value: 12 },
      ],
      acquisitionHistory: [{ date: "2026-02-01", cumulativeAcquisition: 8 }],
      currentValue: 12,
      totalAcquisition: 8,
    })
    expect(sparkline.dates).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"])
    expect(sparkline.value).toEqual([10, 10, 12])
    expect(sparkline.acquisition).toEqual([0, 8, 8])
  })

  it("has no cost points when nothing in scope has an acquisition date", () => {
    const sparkline = buildBoxSparkline({
      valueHistory: [
        { date: "2026-02-01", value: 10 },
        { date: "2026-07-01", value: 14 },
      ],
      acquisitionHistory: [],
      currentValue: 14,
      totalAcquisition: 3,
    })
    expect(sparkline.dates).toEqual(["2026-02-01", "2026-07-01"])
    expect(sparkline.value).toEqual([10, 14])
    expect(sparkline.acquisition).toEqual([])
    expect(sparkline.totalAcquisition).toBe(3)
  })

  it("samples a long series down to 24 real points, ending on the latest figures", () => {
    const valueHistory = Array.from({ length: 400 }, (_, i) => ({ date: day(i), value: i * 2 }))
    const acquisitionHistory = Array.from({ length: 90 }, (_, i) => ({
      date: day(i * 3),
      cumulativeAcquisition: (i + 1) * 5,
    }))
    const sparkline = buildBoxSparkline({
      valueHistory,
      acquisitionHistory,
      currentValue: 798,
      totalAcquisition: 450,
    })
    expect(sparkline.dates).toHaveLength(BOX_SPARKLINE_MAX_POINTS)
    expect(sparkline.value).toHaveLength(BOX_SPARKLINE_MAX_POINTS)
    expect(sparkline.acquisition).toHaveLength(BOX_SPARKLINE_MAX_POINTS)
    expect(sparkline.dates[0]).toBe(day(0))
    expect(sparkline.dates[23]).toBe(day(399))
    expect(sparkline.value[23]).toBe(798)
    expect(sparkline.acquisition[23]).toBe(450)
    sparkline.dates.forEach((date, i) => {
      // Every kept point is a real point of the merged series.
      expect(valueHistory.find((p) => p.date === date)?.value).toBe(sparkline.value[i])
      const latestCost = acquisitionHistory.filter((p) => p.date <= date).pop()?.cumulativeAcquisition ?? 0
      expect(sparkline.acquisition[i]).toBe(latestCost)
    })
  })

  it("honours a custom point budget", () => {
    const valueHistory = Array.from({ length: 50 }, (_, i) => ({ date: day(i), value: i }))
    expect(buildBoxSparkline({ ...empty, valueHistory }, 8).dates).toHaveLength(8)
  })

  it("rounds floating-point noise to cents", () => {
    const sparkline = buildBoxSparkline({
      valueHistory: [
        { date: "2026-01-01", value: 0.1 + 0.2 },
        { date: "2026-01-02", value: 1.005 + 2.01 },
      ],
      acquisitionHistory: [],
      currentValue: 0.1 + 0.2,
      totalAcquisition: 0,
    })
    expect(sparkline.value[0]).toBe(0.3)
    expect(sparkline.currentValue).toBe(0.3)
    expect(String(sparkline.value[1]).length).toBeLessThanOrEqual(4)
  })
})

describe("sparklineGeometry", () => {
  const none = { dates: [], value: [], acquisition: [] }

  it("has nothing to draw without a series or with fewer than two points", () => {
    expect(sparklineGeometry(null, 100, 32)).toBeNull()
    expect(sparklineGeometry(undefined, 100, 32)).toBeNull()
    expect(sparklineGeometry(none, 100, 32)).toBeNull()
    expect(sparklineGeometry({ dates: ["2026-07-01"], value: [20], acquisition: [] }, 100, 32)).toBeNull()
  })

  it("places points by time, on one y scale that starts at zero", () => {
    const geometry = sparklineGeometry(
      {
        // 10 days, then 30 days: the middle point sits a quarter of the way along.
        dates: ["2026-01-01", "2026-01-11", "2026-02-10"],
        value: [0, 50, 100],
        acquisition: [25, 25, 75],
      },
      100,
      32
    )
    // y runs from 30 (zero) up to 2 (the largest figure, 100).
    expect(geometry).toEqual({
      value: "0,30 25,16 100,2",
      acquisition: "0,23 25,23 100,9",
      baselineY: 30,
    })
  })

  it("draws a zero-filled start on the baseline", () => {
    const geometry = sparklineGeometry(
      { dates: ["2026-01-01", "2026-01-02", "2026-01-03"], value: [0, 0, 40], acquisition: [20, 20, 20] },
      100,
      32
    )
    expect(geometry?.value).toBe("0,30 50,30 100,2")
    expect(geometry?.acquisition).toBe("0,16 50,16 100,16")
  })

  it("omits the cost line when the series has none", () => {
    const geometry = sparklineGeometry(
      { dates: ["2026-01-01", "2026-01-02"], value: [10, 20], acquisition: [] },
      100,
      32
    )
    expect(geometry).toEqual({ value: "0,16 100,2", acquisition: null, baselineY: 30 })
  })

  it("ignores a cost series that does not cover every date", () => {
    const geometry = sparklineGeometry(
      { dates: ["2026-01-01", "2026-01-02"], value: [10, 20], acquisition: [5] },
      100,
      32
    )
    expect(geometry?.acquisition).toBeNull()
  })

  it("draws flat lines on the baseline when every figure is zero", () => {
    const geometry = sparklineGeometry(
      { dates: ["2026-01-01", "2026-01-02"], value: [0, 0], acquisition: [0, 0] },
      100,
      32
    )
    expect(geometry).toEqual({ value: "0,30 100,30", acquisition: "0,30 100,30", baselineY: 30 })
  })

  it("spaces points evenly when the dates cannot be parsed", () => {
    const geometry = sparklineGeometry(
      { dates: ["first", "second", "third"], value: [0, 50, 100], acquisition: [] },
      100,
      32
    )
    expect(geometry?.value).toBe("0,30 50,16 100,2")
  })

  it("keeps every coordinate inside the box", () => {
    const geometry = sparklineGeometry(
      {
        dates: ["2026-01-01", "2026-03-01", "2026-06-01"],
        value: [5, 9000, 12],
        acquisition: [3, 3, 8000],
      },
      100,
      32
    )
    const numbers = `${geometry!.value} ${geometry!.acquisition}`
      .trim()
      .split(/\s+/)
      .map((pair) => pair.split(",").map(Number))
    expect(numbers).toHaveLength(6)
    for (const [x, y] of numbers) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(100)
      expect(y).toBeGreaterThanOrEqual(2)
      expect(y).toBeLessThanOrEqual(30)
    }
  })
})
