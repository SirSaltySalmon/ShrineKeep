import { describe, expect, it, vi } from "vitest"
import { GET } from "./route"

const { mockCreateSupabaseServerClient } = vi.hoisted(() => ({
  mockCreateSupabaseServerClient: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}))

describe("GET /api/wishlist/[token]", () => {
  it("returns 400 when token is missing", async () => {
    const response = await GET(new Request("http://localhost/api/wishlist/") as any, {
      params: Promise.resolve({ token: "" }),
    })
    expect(response.status).toBe(400)
  })

  it("returns 404 when wishlist token is not public/found", async () => {
    const settingsChain = {
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: "missing" } }),
    }
    mockCreateSupabaseServerClient.mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue(settingsChain),
      }),
    })
    const response = await GET(new Request("http://localhost/api/wishlist/token123") as any, {
      params: Promise.resolve({ token: "token123" }),
    })
    expect(response.status).toBe(404)
  })
})
