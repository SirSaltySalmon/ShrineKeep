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
  return new Request("http://localhost/api/wishlist/suggestions/apply", {
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

describe("POST /api/wishlist/suggestions/apply", () => {
  beforeEach(() => vi.clearAllMocks())

  it("requires authentication", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })
    const response = await POST(makeRequest({ changes: [] }) as never)
    expect(response.status).toBe(401)
  })

  it("applies valuation without expected price", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(
      authenticatedSupabase([{ id: "item-1", updated_at: "v1" }])
    )
    mockApplyItemPatch.mockResolvedValue(undefined)
    const response = await POST(
      makeRequest({
        changes: [{ id: "item-1", expected_updated_at: "v1", current_value: 42 }],
      }) as never
    )
    expect(response.status).toBe(200)
    expect(mockApplyItemPatch).toHaveBeenCalledWith(
      expect.objectContaining({
        patch: { id: "item-1", current_value: 42 },
      })
    )
  })

  it("applies metadata-only wishlist edits", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(
      authenticatedSupabase([{ id: "item-1", updated_at: "v1" }])
    )
    mockApplyItemPatch.mockResolvedValue(undefined)
    const response = await POST(
      makeRequest({
        changes: [{
          id: "item-1",
          expected_updated_at: "v1",
          name: "Updated wish",
          description: "Updated details",
          tag_ids: ["tag-1"],
        }],
      }) as never
    )
    expect(response.status).toBe(200)
    expect(mockApplyItemPatch).toHaveBeenCalledWith(
      expect.objectContaining({
        patch: {
          id: "item-1",
          name: "Updated wish",
          description: "Updated details",
          tag_ids: ["tag-1"],
        },
      })
    )
  })

  it("rejects a row with no editable fields", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(
      authenticatedSupabase([{ id: "item-1", updated_at: "v1" }])
    )
    const response = await POST(
      makeRequest({ changes: [{ id: "item-1", expected_updated_at: "v1" }] }) as never
    )
    expect(response.status).toBe(400)
    expect(mockApplyItemPatch).not.toHaveBeenCalled()
  })
})
