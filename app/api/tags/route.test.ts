import { beforeEach, describe, expect, it, vi } from "vitest"
import { GET, PATCH, POST } from "./route"

const { mockCreateSupabaseServerClient } = vi.hoisted(() => ({
  mockCreateSupabaseServerClient: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}))

function makeRequest(method: string, body?: unknown): Request {
  return new Request("http://localhost/api/tags", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
}

describe("/api/tags", () => {
  beforeEach(() => vi.clearAllMocks())

  it("GET returns 401 when unauthenticated", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })
    const response = await GET()
    expect(response.status).toBe(401)
  })

  it("POST returns 400 when name missing", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
    })
    const response = await POST(makeRequest("POST", { name: "" }) as any)
    expect(response.status).toBe(400)
  })

  it("PATCH returns 400 when no update fields provided", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
    })
    const response = await PATCH(makeRequest("PATCH", { id: "tag-1" }) as any)
    expect(response.status).toBe(400)
  })
})
