import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "./route"

const { mockCreateSupabaseServerClient, mockMoveItems } = vi.hoisted(() => ({
  mockCreateSupabaseServerClient: vi.fn(),
  mockMoveItems: vi.fn(),
}))
const { mockStartRouteSpan } = vi.hoisted(() => ({
  mockStartRouteSpan: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}))

vi.mock("@/lib/api/move-item", () => ({
  moveItems: mockMoveItems,
}))

vi.mock("@/lib/monitoring/sentry", () => ({
  startRouteSpan: mockStartRouteSpan,
}))

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/items/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/items/move", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStartRouteSpan.mockImplementation(async (_name, _op, _attrs, callback) => callback())
  })

  it("returns 401 when user is not authenticated", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })

    const response = await POST(makeRequest({ itemId: "item-1", targetBoxId: null }) as any)

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" })
  })

  it("returns 400 when no item id(s) are provided", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    })

    const response = await POST(makeRequest({ targetBoxId: "box-2" }) as any)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "itemId or itemIds array is required",
    })
  })

  it("returns moved count on successful move", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    })
    mockMoveItems.mockResolvedValue({ movedCount: 2 })

    const response = await POST(
      makeRequest({ itemIds: ["item-1", "item-2"], targetBoxId: "box-9" }) as any
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true, movedCount: 2 })
    expect(mockMoveItems).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      ["item-1", "item-2"],
      "box-9"
    )
  })
})
