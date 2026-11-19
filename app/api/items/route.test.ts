import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { POST, PATCH } from "./route"
import { ItemCapExceededError } from "@/lib/api/item-cap-error"
import { ItemNotFoundError } from "@/lib/api/patch-item"

const {
  mockCreateSupabaseServerClient,
  mockCreateItems,
  mockApplyItemPatch,
  mockGetOwnedBoxIdSet,
  mockCaptureRouteException,
} = vi.hoisted(() => ({
  mockCreateSupabaseServerClient: vi.fn(),
  mockCreateItems: vi.fn(),
  mockApplyItemPatch: vi.fn(),
  mockGetOwnedBoxIdSet: vi.fn(),
  mockCaptureRouteException: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}))

vi.mock("@/lib/api/create-item", () => ({
  createItems: mockCreateItems,
}))

vi.mock("@/lib/api/patch-item", () => ({
  applyItemPatch: mockApplyItemPatch,
  ItemNotFoundError: class ItemNotFoundError extends Error {
    constructor() {
      super("Item not found")
      this.name = "ItemNotFoundError"
    }
  },
}))

vi.mock("@/lib/api/validate-box-ownership", () => ({
  getOwnedBoxIdSet: mockGetOwnedBoxIdSet,
}))

vi.mock("@/lib/monitoring/sentry", () => ({
  captureRouteException: mockCaptureRouteException,
}))

function makeRequest(body: unknown, method: string = "POST"): Request {
  return new Request("http://localhost/api/items", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function usersFrom(row: { is_sandbox: boolean; sandbox_expires_at: string | null }) {
  return vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
      }),
    }),
  })
}

function liveUserClient() {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    from: usersFrom({ is_sandbox: false, sandbox_expires_at: null }),
  }
}

describe("POST /api/items", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 when user is not authenticated", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })

    const response = await POST(makeRequest({}) as any)

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" })
  })

  it("returns 401 when a sandbox session is expired", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { is_sandbox: true, sandbox_expires_at: "2000-01-01T00:00:00.000Z" },
              error: null,
            }),
          }),
        }),
      }),
    })

    const response = await POST(makeRequest({ name: "Card" }) as any)

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "Sandbox expired." })
  })

  it("returns 400 when name is missing", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
      from: usersFrom({ is_sandbox: false, sandbox_expires_at: null }),
    })

    const response = await POST(makeRequest({ is_wishlist: false, photos: [] }) as any)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: "Name is required" })
  })

  it("returns 400 for non-owned collection box", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(liveUserClient())
    mockGetOwnedBoxIdSet.mockResolvedValue(new Set<string>())

    const response = await POST(
      makeRequest({
        name: "Camera",
        is_wishlist: false,
        box_id: "box-1",
        photos: [],
      }) as any
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "box_id must reference one of your boxes",
    })
  })

  it("returns 403 when cap is exceeded", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(liveUserClient())
    mockGetOwnedBoxIdSet.mockResolvedValue(new Set<string>())
    mockCreateItems.mockRejectedValue(new ItemCapExceededError(100, 100))

    const response = await POST(
      makeRequest({
        name: "Camera",
        is_wishlist: false,
        photos: [],
      }) as any
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: "item_limit_reached",
      currentCount: 100,
      cap: 100,
    })
  })

  it("creates an item on valid payload", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
        }),
      },
      from: usersFrom({ is_sandbox: false, sandbox_expires_at: null }),
    })
    mockGetOwnedBoxIdSet.mockResolvedValue(new Set<string>(["box-1"]))
    mockCreateItems.mockResolvedValue({ itemIds: ["item-1"], operations: [] })

    const response = await POST(
      makeRequest({
        name: "  Camera  ",
        description: "  Film  ",
        is_wishlist: false,
        box_id: "box-1",
        photos: [{ url: "https://example.com/p.jpg", is_thumbnail: true }],
      }) as any
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      success: true,
      itemId: "item-1",
    })
    expect(mockCreateItems).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
      })
    )
  })

  it("returns 400 for a body that is not a JSON object", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(liveUserClient())

    const malformed = new Request("http://localhost/api/items", { method: "POST", body: "{not json" })
    for (const request of [malformed, makeRequest(null), makeRequest(["Camera"])]) {
      const response = await POST(request as any)
      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({ error: "Request body must be a JSON object" })
    }
    expect(mockCreateItems).not.toHaveBeenCalled()
  })

  it.each([
    [{ name: 42 }, "name must be a string"],
    [{ name: "Camera", current_value: "12.50" }, "current_value must be a number or null"],
    [{ name: "Camera", acquisition_price: {} }, "acquisition_price must be a number or null"],
    [{ name: "Camera", box_id: 7 }, "box_id must be a string or null"],
    [{ name: "Camera", is_wishlist: "no" }, "is_wishlist must be a boolean"],
    [{ name: "Camera", photos: "p.jpg" }, "photos must be an array of { url, is_thumbnail }"],
    [{ name: "Camera", tag_ids: [1] }, "tag_ids must be an array of strings"],
    [{ name: "Camera", value_history: [{ value: "9" }] }, "value_history must be an array of { value, recorded_at }"],
  ])("returns 400 for wrongly typed field %j", async (body, error) => {
    mockCreateSupabaseServerClient.mockResolvedValue(liveUserClient())

    const response = await POST(makeRequest(body) as any)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error })
    expect(mockCreateItems).not.toHaveBeenCalled()
  })

  it("answers 500 with a fixed message and keeps database text out of the body", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mockCreateSupabaseServerClient.mockResolvedValue(liveUserClient())
    mockGetOwnedBoxIdSet.mockResolvedValue(new Set<string>())
    const dbError = {
      code: "42501",
      message: 'new row violates row-level security policy for table "items"',
    }
    mockCreateItems.mockRejectedValue(dbError)

    const response = await POST(makeRequest({ name: "Camera", is_wishlist: false, photos: [] }) as any)

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: "Could not save the item. Try again." })
    expect(console.error).toHaveBeenCalledWith("Error saving item:", dbError)
    expect(mockCaptureRouteException).toHaveBeenCalledWith(dbError, expect.anything())
  })

  it("rejects POST with an item id", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(liveUserClient())

    const response = await POST(
      makeRequest({
        id: "item-1",
        name: "Camera",
        is_wishlist: false,
        photos: [],
      }) as any
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "Use PATCH to update an existing item",
    })
    expect(mockCreateItems).not.toHaveBeenCalled()
  })
})

describe("PATCH /api/items", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 when user is not authenticated", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })

    const response = await PATCH(makeRequest({ id: "item-1", name: "Lens" }, "PATCH") as any)
    expect(response.status).toBe(401)
  })

  it("returns 400 when id is missing", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(liveUserClient())

    const response = await PATCH(makeRequest({ name: "Lens" }, "PATCH") as any)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: "id is required" })
  })

  it("returns 404 when the item is missing", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(liveUserClient())
    mockGetOwnedBoxIdSet.mockResolvedValue(new Set<string>())
    mockApplyItemPatch.mockRejectedValue(new ItemNotFoundError())

    const response = await PATCH(makeRequest({ id: "missing", name: "Lens" }, "PATCH") as any)
    expect(response.status).toBe(404)
  })

  it("returns 403 when a wishlist -> collection move hits the item cap", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(liveUserClient())
    mockGetOwnedBoxIdSet.mockResolvedValue(new Set(["box-1"]))
    mockApplyItemPatch.mockRejectedValue(new ItemCapExceededError(100, 100))

    const response = await PATCH(makeRequest({
      id: "item-1", is_wishlist: false, box_id: "box-1",
    }, "PATCH") as any)

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: "item_limit_reached",
      currentCount: 100,
      cap: 100,
    })
  })

  it("accepts the mark-as-acquired payload and passes it through unchanged", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(liveUserClient())
    mockGetOwnedBoxIdSet.mockResolvedValue(new Set(["box-1"]))
    mockApplyItemPatch.mockResolvedValue({ itemId: "item-1", operations: [] })

    const patch = {
      id: "item-1",
      is_wishlist: false,
      acquisition_date: "2026-11-18",
      acquisition_price: null,
      box_id: "box-1",
      wishlist_target_box_id: null,
    }
    const response = await PATCH(makeRequest(patch, "PATCH") as any)

    expect(response.status).toBe(200)
    expect(mockApplyItemPatch).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", patch }))
  })

  it("rejects a mark-as-acquired payload that targets someone else's box", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(liveUserClient())
    mockGetOwnedBoxIdSet.mockResolvedValue(new Set<string>())

    const response = await PATCH(makeRequest({
      id: "item-1", is_wishlist: false, box_id: "not-mine", wishlist_target_box_id: null,
    }, "PATCH") as any)

    expect(response.status).toBe(400)
    expect(mockApplyItemPatch).not.toHaveBeenCalled()
  })

  it("returns 400 for a body that is not a JSON object", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(liveUserClient())

    const malformed = new Request("http://localhost/api/items", { method: "PATCH", body: "{not json" })
    for (const request of [malformed, makeRequest(null, "PATCH")]) {
      const response = await PATCH(request as any)
      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({ error: "Request body must be a JSON object" })
    }
  })

  it.each([
    [{ id: "item-1", name: 42 }, "name must be a string"],
    [{ id: "item-1", name: null }, "name must be a string"],
    [{ id: "item-1", acquisition_price: "12.50" }, "acquisition_price must be a number or null"],
    [{ id: "item-1", acquisition_date: 20261118 }, "acquisition_date must be a string or null"],
    [{ id: "item-1", is_wishlist: 0 }, "is_wishlist must be a boolean"],
  ])("returns 400 for wrongly typed field %j", async (body, error) => {
    mockCreateSupabaseServerClient.mockResolvedValue(liveUserClient())

    const response = await PATCH(makeRequest(body, "PATCH") as any)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error })
    expect(mockApplyItemPatch).not.toHaveBeenCalled()
  })

  it("answers 500 with a fixed message and keeps database text out of the body", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mockCreateSupabaseServerClient.mockResolvedValue(liveUserClient())
    mockGetOwnedBoxIdSet.mockResolvedValue(new Set<string>())
    const dbError = { code: "22003", message: "numeric field overflow" }
    mockApplyItemPatch.mockRejectedValue(dbError)

    const response = await PATCH(makeRequest({ id: "item-1", current_value: 1e12 }, "PATCH") as any)

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: "Could not update the item. Try again." })
    expect(console.error).toHaveBeenCalledWith("Error updating item:", dbError)
  })

  it("applies a sparse patch body", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(liveUserClient())
    mockGetOwnedBoxIdSet.mockResolvedValue(new Set<string>())
    mockApplyItemPatch.mockResolvedValue({ itemId: "item-1", operations: [] })

    const patch = {
      id: "item-1",
      name: "Lens",
      photos: { update: [{ id: "photo-1", is_thumbnail: true }] },
    }
    const response = await PATCH(makeRequest(patch, "PATCH") as any)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      success: true,
      itemId: "item-1",
    })
    expect(mockApplyItemPatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        patch,
      })
    )
    expect(mockCreateItems).not.toHaveBeenCalled()
  })

  it("returns an actionable conflict when a wishlist move broadens visibility", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(liveUserClient())
    mockGetOwnedBoxIdSet.mockResolvedValue(new Set(["public-box"]))
    mockApplyItemPatch.mockRejectedValue({
      code: "P0001",
      message: "privacy_conflict",
      details: "Internal database details",
    })

    const response = await PATCH(makeRequest({
      id: "item-1", wishlist_target_box_id: "public-box",
    }, "PATCH") as any)

    expect(response.status).toBe(409)
    const body = await response.json()
    expect(body.code).toBe("privacy_conflict")
    expect(body.error).toContain("visible to more people")
    expect(JSON.stringify(body)).not.toContain("Internal database details")
    expect(mockCaptureRouteException).not.toHaveBeenCalled()
  })
})
