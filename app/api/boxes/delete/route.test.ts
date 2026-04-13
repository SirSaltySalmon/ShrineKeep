import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "./route"

const {
  mockCreateSupabaseServerClient,
  mockDeleteBoxesForUser,
  mockStartRouteSpan,
} = vi.hoisted(() => ({
  mockCreateSupabaseServerClient: vi.fn(),
  mockDeleteBoxesForUser: vi.fn(),
  mockStartRouteSpan: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}))

vi.mock("@/lib/services/boxes/delete-boxes", () => ({
  deleteBoxesForUser: mockDeleteBoxesForUser,
}))

vi.mock("@/lib/monitoring/sentry", () => ({
  startRouteSpan: mockStartRouteSpan,
}))

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/boxes/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/boxes/delete", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStartRouteSpan.mockImplementation(async (_a, _b, _c, callback) => callback())
  })

  it("returns 401 when unauthenticated", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })

    const response = await POST(makeRequest({ boxId: "box-1", mode: "delete-all" }) as any)
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" })
  })

  it("returns 400 on known validation errors", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    })
    mockDeleteBoxesForUser.mockRejectedValue(new Error("Invalid mode"))

    const response = await POST(makeRequest({ boxId: "box-1", mode: "nope" }) as any)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: "Invalid mode" })
  })

  it("returns deleted count on success", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    })
    mockDeleteBoxesForUser.mockResolvedValue({ deletedCount: 1 })

    const response = await POST(makeRequest({ boxId: "box-1", mode: "delete-all" }) as any)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true, deletedCount: 1 })
    expect(mockDeleteBoxesForUser).toHaveBeenCalledWith(expect.anything(), "user-1", {
      boxId: "box-1",
      mode: "delete-all",
    })
  })
})
