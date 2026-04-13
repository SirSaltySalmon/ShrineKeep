import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "./route"
import { ItemCapExceededError } from "@/lib/api/item-cap-error"

const {
  mockCreateSupabaseServerClient,
  mockCreateItems,
  mockExpandItemRefsToCreateInputs,
  mockGetOwnedBoxIdSet,
  mockStartRouteSpan,
} = vi.hoisted(() => ({
  mockCreateSupabaseServerClient: vi.fn(),
  mockCreateItems: vi.fn(),
  mockExpandItemRefsToCreateInputs: vi.fn(),
  mockGetOwnedBoxIdSet: vi.fn(),
  mockStartRouteSpan: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}))

vi.mock("@/lib/api/create-item", () => ({
  createItems: mockCreateItems,
}))

vi.mock("@/lib/api/copy-expand", () => ({
  expandItemRefsToCreateInputs: mockExpandItemRefsToCreateInputs,
}))

vi.mock("@/lib/api/validate-box-ownership", () => ({
  getOwnedBoxIdSet: mockGetOwnedBoxIdSet,
}))

vi.mock("@/lib/monitoring/sentry", () => ({
  startRouteSpan: mockStartRouteSpan,
}))

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/items/paste", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/items/paste", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStartRouteSpan.mockImplementation(async (_name, _op, _attrs, callback) => callback())
  })

  it("returns 401 when user is not authenticated", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })

    const response = await POST(makeRequest({ items: [] }) as any)

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" })
  })

  it("returns 400 when items array is missing", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    })

    const response = await POST(makeRequest({}) as any)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "items array is required and must not be empty",
    })
  })

  it("returns 403 when item cap is exceeded", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    })
    mockGetOwnedBoxIdSet.mockResolvedValue(new Set<string>())
    mockCreateItems.mockRejectedValue(new ItemCapExceededError(100, 100))

    const response = await POST(
      makeRequest({
        items: [
          {
            name: "Camera",
            is_wishlist: false,
            photos: [],
          },
        ],
      }) as any
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: "item_limit_reached",
      currentCount: 100,
      cap: 100,
    })
  })

  it("creates items and returns item ids for valid payload", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    })
    mockGetOwnedBoxIdSet.mockResolvedValue(new Set<string>(["box-1"]))
    mockCreateItems.mockResolvedValue({
      itemIds: ["item-1"],
      operations: ["created 1 item(s)"],
    })

    const response = await POST(
      makeRequest({
        items: [
          {
            name: "  Camera  ",
            description: "  Film camera  ",
            is_wishlist: false,
            box_id: "box-1",
            photos: [{ url: "https://example.com/p.jpg", is_thumbnail: true }],
            current_value: 320,
          },
        ],
      }) as any
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      success: true,
      itemIds: ["item-1"],
      operations: ["created 1 item(s)"],
    })

    expect(mockCreateItems).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        items: [
          expect.objectContaining({
            itemData: expect.objectContaining({
              name: "Camera",
              description: "Film camera",
              user_id: "user-1",
              box_id: "box-1",
              is_wishlist: false,
            }),
          }),
        ],
      })
    )
    expect(mockExpandItemRefsToCreateInputs).not.toHaveBeenCalled()
  })
})
