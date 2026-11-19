import { afterEach, describe, expect, it, vi } from "vitest"
import { fetchBoxSparklines, sparklineIdsKey } from "./use-box-sparklines"
import { BOX_SPARKLINE_MAX_BOXES, type BoxSparklineSeries } from "@/lib/stats/box-sparkline"

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`

function series(currentValue: number): BoxSparklineSeries {
  return {
    dates: ["2026-01-01", "2026-07-01"],
    value: [0, currentValue],
    acquisition: [],
    currentValue,
    totalAcquisition: 0,
  }
}

function stubFetch(handler: (boxIds: string[]) => { status?: number; body: unknown }) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const { boxIds } = JSON.parse(String(init?.body)) as { boxIds: string[] }
    const { status = 200, body } = handler(boxIds)
    return new Response(JSON.stringify(body), { status })
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

describe("sparklineIdsKey", () => {
  it("does not depend on card order or repeats", () => {
    expect(sparklineIdsKey([id(2), id(1), id(2)])).toBe(`${id(1)},${id(2)}`)
    expect(sparklineIdsKey([id(1), id(2)])).toBe(sparklineIdsKey([id(2), id(1)]))
  })

  it("drops placeholders that are not box ids", () => {
    expect(sparklineIdsKey(["box-skeleton-1", "root", "", id(3)])).toBe(id(3))
    expect(sparklineIdsKey(["box-skeleton-1"])).toBe("")
  })
})

describe("fetchBoxSparklines", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("makes no request for an empty list", async () => {
    const fetchMock = stubFetch(() => ({ body: { sparklines: {} } }))
    await expect(fetchBoxSparklines([])).resolves.toEqual({})
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("asks for every visible box in one request", async () => {
    const ids = Array.from({ length: 16 }, (_, i) => id(i))
    const fetchMock = stubFetch((boxIds) => ({
      body: { sparklines: Object.fromEntries(boxIds.map((boxId, i) => [boxId, series(i)])) },
    }))

    const sparklines = await fetchBoxSparklines(ids)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/boxes/sparklines")
    expect(init?.method).toBe("POST")
    expect(JSON.parse(String(init?.body))).toEqual({ boxIds: ids })
    expect(Object.keys(sparklines)).toHaveLength(16)
    expect(sparklines[id(5)]).toEqual(series(5))
  })

  it("splits a list longer than the route's cap and merges the answers", async () => {
    const ids = Array.from({ length: BOX_SPARKLINE_MAX_BOXES + 20 }, (_, i) => id(i))
    const fetchMock = stubFetch((boxIds) => ({
      body: { sparklines: Object.fromEntries(boxIds.map((boxId) => [boxId, series(1)])) },
    }))

    const sparklines = await fetchBoxSparklines(ids)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(Object.keys(sparklines)).toHaveLength(ids.length)
  })

  it("tolerates a response with no sparklines", async () => {
    stubFetch(() => ({ body: {} }))
    await expect(fetchBoxSparklines([id(1)])).resolves.toEqual({})
  })

  it("throws when the route refuses", async () => {
    stubFetch(() => ({ status: 401, body: { error: "Unauthorized" } }))
    await expect(fetchBoxSparklines([id(1)])).rejects.toThrow("Failed to load box sparklines")
  })
})
