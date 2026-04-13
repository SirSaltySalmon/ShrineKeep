import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "./route"

const { mockCreateSupabaseServerClient, mockCountCollectionItemsInBoxSubtrees } = vi.hoisted(() => ({
  mockCreateSupabaseServerClient: vi.fn(),
  mockCountCollectionItemsInBoxSubtrees: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}))

vi.mock("@/lib/api/copy-expand", () => ({
  countCollectionItemsInBoxSubtrees: mockCountCollectionItemsInBoxSubtrees,
}))

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/boxes/subtree/count", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/boxes/subtree/count", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns 401 when unauthenticated", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })
    const response = await POST(makeRequest({ rootIds: ["box-1"] }) as any)
    expect(response.status).toBe(401)
  })

  it("returns 400 when rootIds missing", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
    })
    const response = await POST(makeRequest({ rootIds: [] }) as any)
    expect(response.status).toBe(400)
  })

  it("returns count on success", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } } }) },
    })
    mockCountCollectionItemsInBoxSubtrees.mockResolvedValue(12)
    const response = await POST(makeRequest({ rootIds: ["box-1"] }) as any)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ itemCount: 12 })
  })
})
