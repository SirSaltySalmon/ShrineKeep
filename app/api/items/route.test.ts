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
  afterEach(() => vi.unstubAllEnvs())

  it("persists explicit Private on creation when rollout is enabled", async () => {
    vi.stubEnv("SOCIAL_SHARING_EDITS_ENABLED", "true")
    mockCreateSupabaseServerClient.mockResolvedValue(liveUserClient())
    mockGetOwnedBoxIdSet.mockResolvedValue(new Set())
    mockCreateItems.mockResolvedValue({ itemIds: ["item-1"] })
    const response = await POST(makeRequest({ name: "Lens", is_wishlist: true, wishlist_is_private: true, photos: [] }) as any)
    expect(response.status).toBe(200)
    expect(mockCreateItems.mock.calls[0][0].items[0].itemData.wishlist_is_private).toBe(true)
  })

  it("does not create when a supplied privacy field is gated off", async () => {
    vi.stubEnv("SOCIAL_SHARING_EDITS_ENABLED", "false")
    mockCreateSupabaseServerClient.mockResolvedValue(liveUserClient())
    const response = await POST(makeRequest({ name: "Lens", is_wishlist: true, wishlist_is_private: true, photos: [] }) as any)
    expect(response.status).toBe(503)
    expect(mockCreateItems).not.toHaveBeenCalled()
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
    expect(mockCreateItems.mock.calls[0][0].items[0].isUpdate).toBeUndefined()
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
  it("requires a separate edit to clear Private while moving", async () => {
    vi.stubEnv("SOCIAL_SHARING_EDITS_ENABLED", "true")
    mockCreateSupabaseServerClient.mockResolvedValue(liveUserClient())
    const response = await PATCH(makeRequest({
      id: "item-1", wishlist_is_private: false, wishlist_target_box_id: "box-2",
    }, "PATCH") as any)
    expect(response.status).toBe(409)
    expect(mockApplyItemPatch).not.toHaveBeenCalled()
  })
  afterEach(() => vi.unstubAllEnvs())

  it.each([true, false])("passes explicit privacy %s when rollout is enabled", async (value) => {
    vi.stubEnv("SOCIAL_SHARING_EDITS_ENABLED", "true")
    mockCreateSupabaseServerClient.mockResolvedValue(liveUserClient())
    mockGetOwnedBoxIdSet.mockResolvedValue(new Set())
    mockApplyItemPatch.mockResolvedValue({ itemId: "item-1" })
    const patch = { id: "item-1", wishlist_is_private: value }
    const response = await PATCH(makeRequest(patch, "PATCH") as any)
    expect(response.status).toBe(200)
    expect(mockApplyItemPatch).toHaveBeenCalledWith(expect.objectContaining({ patch }))
  })

  it("rejects privacy edits while rollout is disabled", async () => {
    vi.stubEnv("SOCIAL_SHARING_EDITS_ENABLED", "false")
    mockCreateSupabaseServerClient.mockResolvedValue(liveUserClient())
    const response = await PATCH(makeRequest({ id: "item-1", wishlist_is_private: true }, "PATCH") as any)
    expect(response.status).toBe(503)
    expect(mockApplyItemPatch).not.toHaveBeenCalled()
  })

  it.each([null, "false", 0, {}])("rejects non-boolean privacy %s", async (value) => {
    vi.stubEnv("SOCIAL_SHARING_EDITS_ENABLED", "true")
    mockCreateSupabaseServerClient.mockResolvedValue(liveUserClient())
    const response = await PATCH(makeRequest({ id: "item-1", wishlist_is_private: value }, "PATCH") as any)
    expect(response.status).toBe(400)
    expect(mockApplyItemPatch).not.toHaveBeenCalled()
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
