import { describe, expect, it, vi } from "vitest"
import { GET } from "./route"

const { mockCreateSupabaseServerClient } = vi.hoisted(() => ({
  mockCreateSupabaseServerClient: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}))

describe("GET /api/boxes/[boxId]/stats", () => {
  it("returns 401 when unauthenticated", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })
    const response = await GET(
      new Request("http://localhost/api/boxes/root/stats") as any,
      { params: Promise.resolve({ boxId: "root" }) }
    )
    expect(response.status).toBe(401)
  })

  it("returns 400 when boxId is empty", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
    })
    const response = await GET(
      new Request("http://localhost/api/boxes//stats") as any,
      { params: Promise.resolve({ boxId: "" }) }
    )
    expect(response.status).toBe(400)
  })
})
