import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "./route"

const { mockCreateSupabaseServerClient } = vi.hoisted(() => ({
  mockCreateSupabaseServerClient: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}))

vi.mock("@/lib/api/validate-box-ownership", () => ({
  getOwnedBoxIdSet: vi.fn(),
}))

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/agent/wishlist-context", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/agent/wishlist-context", () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([false, true])("returns intact evidence links with full description=%s", async (includeFullDescription) => {
    const url = "https://shop.example.com/exact-variant"
    const description = `${"Notes ".repeat(60)}[Evidence](${url})`
    const query: Record<string, ReturnType<typeof vi.fn>> = {}
    for (const method of ["select", "eq", "is", "order"]) query[method] = vi.fn().mockReturnValue(query)
    query.range = vi.fn().mockResolvedValue({ data: [{ id: "item-1", name: "Variant", description }], count: 1, error: null })
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
      from: vi.fn().mockReturnValue(query),
    })
    const response = await POST(makeRequest({ includeFullDescription }) as any)
    expect(response.status).toBe(200)
    expect((await response.json()).items[0]).toMatchObject({
      description: includeFullDescription ? description : description.slice(0, 300),
      description_truncated: !includeFullDescription,
      description_urls: [url],
    })
    expect(query.eq).toHaveBeenCalledWith("user_id", "user-1")
    expect(query.eq).toHaveBeenCalledWith("is_wishlist", true)
  })

  it("uses item id as the unique pagination tie-breaker", async () => {
    const range = vi.fn().mockResolvedValue({ data: [], count: 0, error: null })
    const query: Record<string, ReturnType<typeof vi.fn>> = {}
    for (const method of ["select", "eq", "is", "order"]) {
      query[method] = vi.fn().mockReturnValue(query)
    }
    query.range = range

    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
      from: vi.fn().mockReturnValue(query),
    })

    const response = await POST(makeRequest({ offset: 0, limit: 10 }) as any)

    expect(response.status).toBe(200)
    expect(query.order).toHaveBeenNthCalledWith(1, "created_at", { ascending: false })
    expect(query.order).toHaveBeenNthCalledWith(2, "id", { ascending: false })
    expect(range).toHaveBeenCalledWith(0, 9)
  })
})
