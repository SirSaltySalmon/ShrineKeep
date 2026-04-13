import { beforeEach, describe, expect, it, vi } from "vitest"
import { GET, PUT } from "./route"

const { mockCreateSupabaseServerClient, mockGenerateShareToken } = vi.hoisted(() => ({
  mockCreateSupabaseServerClient: vi.fn(),
  mockGenerateShareToken: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}))

vi.mock("@/lib/settings", () => ({
  generateShareToken: mockGenerateShareToken,
}))

function makePutRequest(body: unknown): Request {
  return new Request("http://localhost/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("/api/settings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("GET returns 401 when unauthenticated", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })
    const response = await GET(new Request("http://localhost/api/settings") as any)
    expect(response.status).toBe(401)
  })

  it("GET returns default shape when settings missing", async () => {
    const selectChain = {
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(selectChain) }),
    })

    const response = await GET(new Request("http://localhost/api/settings") as any)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.user_id).toBe("u1")
  })

  it("PUT returns 400 for invalid theme format", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
    })
    const response = await PUT(makePutRequest({ theme: "bad" }) as any)
    expect(response.status).toBe(400)
  })
})
