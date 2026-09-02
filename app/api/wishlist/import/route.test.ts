import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "./route"

const { mockCreateSupabaseServerClient, mockCreateItems, mockGetOwnedBoxIdSet } = vi.hoisted(() => ({
  mockCreateSupabaseServerClient: vi.fn(),
  mockCreateItems: vi.fn(),
  mockGetOwnedBoxIdSet: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}))

vi.mock("@/lib/api/create-item", () => ({
  createItems: mockCreateItems,
}))

vi.mock("@/lib/api/validate-box-ownership", () => ({
  getOwnedBoxIdSet: mockGetOwnedBoxIdSet,
}))

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/wishlist/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function baseSupabase() {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
  }
}

describe("POST /api/wishlist/import", () => {
  beforeEach(() => vi.clearAllMocks())

  it("requires authentication", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })
    const response = await POST(makeRequest({}) as any)
    expect(response.status).toBe(401)
  })

  it("previews existing collection and wishlist name matches", async () => {
    const eq = vi.fn().mockResolvedValue({
      data: [
        { name: "Card One", is_wishlist: false },
        { name: "Card Two", is_wishlist: true },
      ],
      error: null,
    })
    const select = vi.fn().mockReturnValue({ eq })
    mockCreateSupabaseServerClient.mockResolvedValue({
      ...baseSupabase(),
      from: vi.fn().mockReturnValue({ select }),
    })

    const response = await POST(
      makeRequest({
        mode: "preview",
        items: [{ name: "Card One" }, { name: "Card Two" }, { name: "Card Three" }],
      }) as any
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      items: [
        { name: "Card One", existingMatch: "collection" },
        { name: "Card Two", existingMatch: "wishlist" },
        { name: "Card Three", existingMatch: null },
      ],
    })
  })

  it("imports only the approved wishlist rows into the selected box", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(baseSupabase())
    mockGetOwnedBoxIdSet.mockResolvedValue(new Set(["box-1"]))
    mockCreateItems.mockResolvedValue({ itemIds: ["wish-1"], operations: [] })

    const response = await POST(
      makeRequest({
        mode: "apply",
        targetBoxId: "box-1",
        items: [{ name: "Card One", expected_price: 4.5 }],
      }) as any
    )

    expect(response.status).toBe(200)
    expect(mockCreateItems).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        items: [
          expect.objectContaining({
            itemData: expect.objectContaining({
              name: "Card One",
              expected_price: 4.5,
              wishlist_target_box_id: "box-1",
              is_wishlist: true,
            }),
          }),
        ],
      })
    )
  })
})
