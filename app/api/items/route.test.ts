import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "./route"
import { ItemCapExceededError } from "@/lib/api/item-cap-error"

const {
  mockCreateSupabaseServerClient,
  mockCreateItems,
  mockGetOwnedBoxIdSet,
  mockCaptureRouteException,
} = vi.hoisted(() => ({
  mockCreateSupabaseServerClient: vi.fn(),
  mockCreateItems: vi.fn(),
  mockGetOwnedBoxIdSet: vi.fn(),
  mockCaptureRouteException: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}))

vi.mock("@/lib/api/create-item", () => ({
  createItems: mockCreateItems,
}))

vi.mock("@/lib/api/validate-box-ownership", () => ({
  getOwnedBoxIdSet: mockGetOwnedBoxIdSet,
}))

vi.mock("@/lib/monitoring/sentry", () => ({
  captureRouteException: mockCaptureRouteException,
}))

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/items", () => {
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

  it("returns 400 when name is missing", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    })

    const response = await POST(makeRequest({ is_wishlist: false, photos: [] }) as any)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: "Name is required" })
  })

  it("returns 400 for non-owned collection box", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    })
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
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    })
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
})
