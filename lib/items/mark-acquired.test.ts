import { afterEach, describe, expect, it, vi } from "vitest"
import { markItemAcquired } from "./mark-acquired"

const input = {
  id: "item-1",
  acquisitionDate: "2026-11-18",
  acquisitionPrice: 42.5,
  boxId: "box-1",
}

function stubFetch(response: Response | Error) {
  const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => {
    if (response instanceof Error) throw response
    return response
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

describe("markItemAcquired", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("patches the item into the collection and resolves ok", async () => {
    const fetchMock = stubFetch(Response.json({ success: true, itemId: "item-1" }))

    await expect(markItemAcquired(input)).resolves.toEqual({ ok: true })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/items")
    expect(init.method).toBe("PATCH")
    expect(JSON.parse(init.body as string)).toEqual({
      id: "item-1",
      is_wishlist: false,
      acquisition_date: "2026-11-18",
      acquisition_price: 42.5,
      box_id: "box-1",
      wishlist_target_box_id: null,
    })
  })

  it("sends explicit nulls for a root box and an unknown price", async () => {
    const fetchMock = stubFetch(Response.json({ success: true }))

    await markItemAcquired({ ...input, acquisitionPrice: null, boxId: null })

    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({
      acquisition_price: null,
      box_id: null,
    })
  })

  it("resolves the cap result when the free-tier cap rejects the move", async () => {
    stubFetch(
      Response.json({ error: "item_limit_reached", currentCount: 100, cap: 100 }, { status: 403 })
    )

    await expect(markItemAcquired(input)).resolves.toEqual({
      ok: false,
      reason: "item_limit_reached",
    })
  })

  it("throws the server's message for any other failure", async () => {
    stubFetch(Response.json({ error: "box_id must reference one of your boxes" }, { status: 400 }))

    await expect(markItemAcquired(input)).rejects.toThrow("box_id must reference one of your boxes")
  })

  it("does not treat another 403 as a cap hit", async () => {
    stubFetch(Response.json({ error: "Forbidden" }, { status: 403 }))

    await expect(markItemAcquired(input)).rejects.toThrow("Forbidden")
  })

  it("throws a readable message when the failure has no JSON body", async () => {
    stubFetch(new Response("<html>Bad gateway</html>", { status: 502 }))

    await expect(markItemAcquired(input)).rejects.toThrow(
      "Could not mark the item as acquired. Try again."
    )
  })

  it("throws a readable message when the JSON body has no usable error", async () => {
    stubFetch(Response.json({ error: { code: "nope" } }, { status: 500 }))

    await expect(markItemAcquired(input)).rejects.toThrow(
      "Could not mark the item as acquired. Try again."
    )
  })

  it("throws a readable message when the request never reaches the server", async () => {
    stubFetch(new TypeError("Failed to fetch"))

    await expect(markItemAcquired(input)).rejects.toThrow("Could not reach the server")
  })
})
