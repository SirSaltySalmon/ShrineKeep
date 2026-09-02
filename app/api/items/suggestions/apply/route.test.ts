import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "./route"

const { mockCreateSupabaseServerClient, mockApplyItemPatch } = vi.hoisted(() => ({
  mockCreateSupabaseServerClient: vi.fn(),
  mockApplyItemPatch: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}))

vi.mock("@/lib/api/patch-item", () => ({
  applyItemPatch: mockApplyItemPatch,
}))

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/items/suggestions/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function authenticatedSupabase(rows: Array<{ id: string; updated_at: string }>) {
  const inItems = vi.fn().mockResolvedValue({ data: rows, error: null })
  const eqWishlist = vi.fn().mockReturnValue({ in: inItems })
  const eqUser = vi.fn().mockReturnValue({ eq: eqWishlist })
  const select = vi.fn().mockReturnValue({ eq: eqUser })
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    from: vi.fn().mockReturnValue({ select }),
  }
}

describe("POST /api/items/suggestions/apply", () => {
  beforeEach(() => vi.clearAllMocks())

  it("requires authentication", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })
    const response = await POST(makeRequest({ changes: [] }) as any)
    expect(response.status).toBe(401)
  })

  it("rejects invalid prices before writing", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(authenticatedSupabase([]))
    const response = await POST(
      makeRequest({
        changes: [{ id: "item-1", expected_updated_at: "v1", current_value: -1 }],
      }) as any
    )
    expect(response.status).toBe(400)
    expect(mockApplyItemPatch).not.toHaveBeenCalled()
  })

  it("rejects the batch when an item changed during review", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(
      authenticatedSupabase([{ id: "item-1", updated_at: "new-version" }])
    )
    const response = await POST(
      makeRequest({
        changes: [{ id: "item-1", expected_updated_at: "old-version", current_value: 25 }],
      }) as any
    )
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ conflicts: ["item-1"] })
    expect(mockApplyItemPatch).not.toHaveBeenCalled()
  })

  it("applies approved metadata and valuation fields through the existing item patch path", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(
      authenticatedSupabase([{ id: "item-1", updated_at: "v1" }])
    )
    mockApplyItemPatch.mockResolvedValue({ itemId: "item-1", operations: [] })

    const response = await POST(
      makeRequest({
        changes: [
          {
            id: "item-1",
            expected_updated_at: "v1",
            name: "Updated name",
            description: "Updated description",
            tag_ids: ["tag-1", "tag-2"],
            current_value: 25,
            acquisition_price: 10,
          },
        ],
      }) as any
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true, applied: ["item-1"], failed: [] })
    expect(mockApplyItemPatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        patch: {
          id: "item-1",
          name: "Updated name",
          description: "Updated description",
          tag_ids: ["tag-1", "tag-2"],
          current_value: 25,
          acquisition_price: 10,
        },
      })
    )
  })

  it("accepts a metadata-only edit", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(
      authenticatedSupabase([{ id: "item-1", updated_at: "v1" }])
    )
    mockApplyItemPatch.mockResolvedValue({ itemId: "item-1", operations: [] })

    const response = await POST(
      makeRequest({
        changes: [{ id: "item-1", expected_updated_at: "v1", description: null, tag_ids: [] }],
      }) as any
    )

    expect(response.status).toBe(200)
    expect(mockApplyItemPatch).toHaveBeenCalledWith(
      expect.objectContaining({ patch: { id: "item-1", description: null, tag_ids: [] } })
    )
  })
})
