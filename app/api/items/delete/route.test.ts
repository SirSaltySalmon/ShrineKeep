import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "./route"

const { mockCreateSupabaseServerClient, mockDeleteItems } = vi.hoisted(() => ({
  mockCreateSupabaseServerClient: vi.fn(),
  mockDeleteItems: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}))

vi.mock("@/lib/api/delete-item", () => ({
  deleteItems: mockDeleteItems,
}))

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/items/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/items/delete", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 when unauthenticated", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })

    const response = await POST(makeRequest({ itemId: "item-1" }) as any)

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" })
  })

  it("returns 400 when no item ids are provided", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    })

    const response = await POST(makeRequest({}) as any)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "itemId or itemIds array is required",
    })
  })

  it("returns deleted counts for valid request", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    })
    mockDeleteItems.mockResolvedValue({
      deletedPhotos: ["photos/path.jpg"],
      deletedCount: 2,
    })

    const response = await POST(makeRequest({ itemIds: ["item-1", "item-2"] }) as any)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      success: true,
      deletedPhotos: ["photos/path.jpg"],
      deletedCount: 2,
    })
    expect(mockDeleteItems).toHaveBeenCalledWith(expect.anything(), "user-1", ["item-1", "item-2"])
  })
})
