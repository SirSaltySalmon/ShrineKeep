import { beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "./route"
import { buildApprovedCreatedItems } from "@/lib/webmcp/review"

const {
  mockCreateSupabaseServerClient,
  mockCreateBoxes,
  mockCreateItems,
  mockGetOwnedBoxIdSet,
} = vi.hoisted(() => ({
  mockCreateSupabaseServerClient: vi.fn(),
  mockCreateBoxes: vi.fn(),
  mockCreateItems: vi.fn(),
  mockGetOwnedBoxIdSet: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateSupabaseServerClient,
}))

vi.mock("@/lib/api/create-box", () => ({ createBoxes: mockCreateBoxes }))
vi.mock("@/lib/api/create-item", () => ({ createItems: mockCreateItems }))
vi.mock("@/lib/api/validate-box-ownership", () => ({
  getOwnedBoxIdSet: mockGetOwnedBoxIdSet,
}))

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/items/suggestions/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function authenticatedSupabase(
  existingItems: Array<{
    name: string
    is_wishlist: boolean
    box_id?: string | null
    wishlist_target_box_id?: string | null
  }> = []
) {
  const eq = vi.fn().mockResolvedValue({ data: existingItems, error: null })
  const select = vi.fn().mockReturnValue({ eq })
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
    from: vi.fn().mockReturnValue({ select }),
  }
}

describe("POST /api/items/suggestions/create", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetOwnedBoxIdSet.mockResolvedValue(new Set(["box-1"]))
    mockCreateItems.mockResolvedValue({ itemIds: ["item-1", "item-2"], operations: [] })
  })

  it.each([false, true])("persists reviewed C evidence for both statuses, new box=%s", async (createNewBox) => {
    mockCreateSupabaseServerClient.mockResolvedValue(authenticatedSupabase())
    mockCreateBoxes.mockResolvedValue(["box-new"])
    const evidence = "Blue edition; retail USD 25; checked 2026-09-02. https://shop.example.com/blue"
    const drafts = (["collection", "wishlist"] as const).map((itemKind) => ({
      key: itemKind, name: itemKind, itemKind, description: evidence,
      currentValue: 20, acquisitionPrice: 25, expectedPrice: 25,
      rationale: "Retail reference", sources: [{ url: "https://shop.example.com/blue" }], existingMatch: null,
    }))
    drafts[0].description += " User-reviewed note."
    const items = buildApprovedCreatedItems(drafts, new Set(["collection", "wishlist"]), true)
    const response = await POST(makeRequest({
      mode: "apply", createNewBox, parentBoxId: "box-1", targetBoxId: "box-1",
      newBoxName: "Collection", attach_price_evidence: true, items,
    }) as any)
    expect(response.status).toBe(200)
    const saved = mockCreateItems.mock.calls[0][0].items
    expect(saved.map((entry: { itemData: { description: string } }) => entry.itemData.description))
      .toEqual([`${evidence} User-reviewed note.`, evidence])
    expect(saved[0].itemData.box_id).toBe(createNewBox ? "box-new" : "box-1")
    expect(saved[1].itemData.wishlist_target_box_id).toBe(createNewBox ? "box-new" : "box-1")
  })

  it.each([
    { flag: undefined, description: "Unapproved evidence" },
    { flag: false, description: "Unapproved evidence" },
    { flag: "true", description: "Unapproved evidence" },
    { flag: true, description: "x".repeat(10_001) },
  ])("rejects invalid description approval or length before writing", async ({ flag, description }) => {
    mockCreateSupabaseServerClient.mockResolvedValue(authenticatedSupabase())
    const response = await POST(makeRequest({ mode: "apply", attach_price_evidence: flag,
      items: [{ name: "Item", item_kind: "wishlist", description }],
    }) as any)
    expect(response.status).toBe(400)
    expect(mockCreateItems).not.toHaveBeenCalled()
    expect(mockCreateBoxes).not.toHaveBeenCalled()
  })

  it("requires authentication", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    })

    const response = await POST(makeRequest({}) as any)
    expect(response.status).toBe(401)
  })

  it("previews exact owned and wishlist matches without writing", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(
      authenticatedSupabase([
        { name: "Gundam Aerial", is_wishlist: true },
        { name: "GUNDAM AERIAL", is_wishlist: false, box_id: "box-1" },
        { name: "Darilbalde", is_wishlist: true, wishlist_target_box_id: "box-1" },
        { name: "Michaelis", is_wishlist: false, box_id: "another-box" },
      ])
    )

    const response = await POST(
      makeRequest({
        mode: "preview",
        createNewBox: false,
        targetBoxId: "box-1",
        items: [
          { name: "Gundam Aerial", item_kind: "wishlist" },
          { name: "Darilbalde", item_kind: "wishlist" },
          { name: "Michaelis", item_kind: "wishlist" },
        ],
      }) as any
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      items: [
        { name: "Gundam Aerial", existingMatch: "collection" },
        { name: "Darilbalde", existingMatch: "wishlist" },
        { name: "Michaelis", existingMatch: null },
      ],
    })
    expect(mockCreateBoxes).not.toHaveBeenCalled()
    expect(mockCreateItems).not.toHaveBeenCalled()
  })

  it("adds approved items directly to the current box and preserves prices", async () => {
    const supabase = authenticatedSupabase()
    mockCreateSupabaseServerClient.mockResolvedValue(supabase)

    const response = await POST(
      makeRequest({
        mode: "apply",
        createNewBox: false,
        targetBoxId: "box-1",
        items: [
          {
            name: "Gundam Aerial",
            item_kind: "collection",
            current_value: 24.5,
            acquisition_price: 19.99,
            photos: [
              {
                url: "https://images.example.com/aerial.jpg",
                is_thumbnail: true,
              },
            ],
          },
          {
            name: "Gundam Calibarn",
            item_kind: "wishlist",
            current_value: 18,
            expected_price: 27.95,
          },
        ],
      }) as any
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      success: true,
      boxId: "box-1",
      itemIds: ["item-1", "item-2"],
    })
    expect(mockGetOwnedBoxIdSet).toHaveBeenCalledWith(supabase, "user-1", ["box-1"])
    expect(mockCreateBoxes).not.toHaveBeenCalled()
    expect(mockCreateItems).toHaveBeenCalledWith({
      supabase,
      userId: "user-1",
      items: [
        {
          itemData: expect.objectContaining({
            name: "Gundam Aerial",
            description: null,
            current_value: 24.5,
            acquisition_price: 19.99,
            expected_price: null,
            thumbnail_url: "https://images.example.com/aerial.jpg",
            box_id: "box-1",
            wishlist_target_box_id: null,
            is_wishlist: false,
          }),
          photos: [
            {
              url: "https://images.example.com/aerial.jpg",
              is_thumbnail: true,
            },
          ],
          tagIds: [],
          currentValue: 24.5,
        },
        {
          itemData: expect.objectContaining({
            name: "Gundam Calibarn",
            description: null,
            current_value: 18,
            acquisition_price: null,
            expected_price: 27.95,
            box_id: null,
            wishlist_target_box_id: "box-1",
            is_wishlist: true,
          }),
          photos: [],
          tagIds: [],
          currentValue: 18,
        },
      ],
    })
  })

  it("creates a child box only for collection initialization", async () => {
    const supabase = authenticatedSupabase()
    mockCreateSupabaseServerClient.mockResolvedValue(supabase)
    mockCreateBoxes.mockResolvedValue(["box-new"])

    const response = await POST(
      makeRequest({
        mode: "apply",
        createNewBox: true,
        parentBoxId: "box-1",
        newBoxName: "The Witch from Mercury",
        items: [{ name: "Darilbalde", item_kind: "wishlist", expected_price: 21 }],
      }) as any
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ boxId: "box-new" })
    expect(mockCreateBoxes).toHaveBeenCalledWith(supabase, "user-1", [
      { name: "The Witch from Mercury", parent_box_id: "box-1" },
    ])
    expect(mockCreateItems).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            itemData: expect.objectContaining({
              expected_price: 21,
              box_id: null,
              wishlist_target_box_id: "box-new",
            }),
          }),
        ],
      })
    )
  })

  it("rejects prices that conflict with item status before writing", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(authenticatedSupabase())

    const response = await POST(
      makeRequest({
        mode: "apply",
        createNewBox: false,
        targetBoxId: "box-1",
        items: [{ name: "Michaelis", item_kind: "wishlist", acquisition_price: 20 }],
      }) as any
    )

    expect(response.status).toBe(400)
    expect(mockCreateBoxes).not.toHaveBeenCalled()
    expect(mockCreateItems).not.toHaveBeenCalled()
  })

  it("rejects non-web thumbnail URLs before writing", async () => {
    mockCreateSupabaseServerClient.mockResolvedValue(authenticatedSupabase())

    const response = await POST(
      makeRequest({
        mode: "apply",
        createNewBox: false,
        targetBoxId: "box-1",
        items: [
          {
            name: "Michaelis",
            item_kind: "wishlist",
            photos: [{ url: "javascript:alert(1)", is_thumbnail: true }],
          },
        ],
      }) as any
    )

    expect(response.status).toBe(400)
    expect(mockCreateItems).not.toHaveBeenCalled()
  })
})
