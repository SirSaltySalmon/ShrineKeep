import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "./route"

const { mockCreateSupabaseServerClient, mockCreateBoxes } = vi.hoisted(() => ({
  mockCreateSupabaseServerClient: vi.fn(),
  mockCreateBoxes: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}))

vi.mock("@/lib/api/create-box", () => ({
  createBoxes: mockCreateBoxes,
}))

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/boxes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/boxes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 when unauthenticated", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })

    const response = await POST(makeRequest({ name: "Root" }) as any)
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" })
  })

  it("returns 400 when batch boxes array is empty", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    })

    const response = await POST(makeRequest({ boxes: [] }) as any)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: "boxes array must not be empty" })
  })

  it("creates a single box", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    })
    mockCreateBoxes.mockResolvedValue(["box-1"])

    const response = await POST(makeRequest({ name: "Collection" }) as any)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true, boxId: "box-1" })
    expect(mockCreateBoxes).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      [expect.objectContaining({ name: "Collection" })]
    )
  })

  it("creates boxes in batch mode", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    })
    mockCreateBoxes.mockResolvedValue(["box-a", "box-b"])

    const response = await POST(
      makeRequest({ boxes: [{ name: "A" }, { name: "B", parent_box_id: "box-a" }] }) as any
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      success: true,
      boxIds: ["box-a", "box-b"],
    })
  })
})
