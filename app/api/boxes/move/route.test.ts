import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "./route"

const { mockCreateSupabaseServerClient, mockMoveBoxes } = vi.hoisted(() => ({
  mockCreateSupabaseServerClient: vi.fn(),
  mockMoveBoxes: vi.fn(),
}))
const { mockStartRouteSpan } = vi.hoisted(() => ({
  mockStartRouteSpan: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}))

vi.mock("@/lib/api/move-box", () => ({
  moveBoxes: mockMoveBoxes,
}))

vi.mock("@/lib/monitoring/sentry", () => ({
  startRouteSpan: mockStartRouteSpan,
}))

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/boxes/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/boxes/move", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStartRouteSpan.mockImplementation(async (_name, _op, _attrs, callback) => callback())
  })

  it("returns 401 when user is not authenticated", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })

    const response = await POST(makeRequest({ boxId: "box-1", targetParentBoxId: null }) as any)

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" })
  })

  it("returns 400 when no box id(s) are provided", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    })

    const response = await POST(makeRequest({ targetParentBoxId: "root-box" }) as any)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "boxId or boxIds array is required",
    })
  })

  it("returns moved count on successful move", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    })
    mockMoveBoxes.mockResolvedValue({ movedCount: 1 })

    const response = await POST(
      makeRequest({ boxIds: ["box-a"], targetParentBoxId: "box-parent" }) as any
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true, movedCount: 1 })
    expect(mockMoveBoxes).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      ["box-a"],
      "box-parent"
    )
  })
})
