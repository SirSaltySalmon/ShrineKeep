import { beforeEach, describe, expect, it, vi } from "vitest"
import { createItems } from "./create-item"
import { ItemCapExceededError } from "./item-cap-error"

const { mockIsProUser, mockGetEffectiveCap, mockGetItemCount } = vi.hoisted(() => ({
  mockIsProUser: vi.fn(),
  mockGetEffectiveCap: vi.fn(),
  mockGetItemCount: vi.fn(),
}))

vi.mock("@/lib/subscription", () => ({
  isProUser: mockIsProUser,
  getEffectiveCap: mockGetEffectiveCap,
  getItemCount: mockGetItemCount,
}))

describe("createItems", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns no-op result when no items are provided", async () => {
    const result = await createItems({
      supabase: {} as any,
      userId: "user-1",
      items: [],
    })

    expect(result).toEqual({
      itemIds: [],
      operations: ["no items to process"],
    })
  })

  it("throws ItemCapExceededError when free-tier cap would be exceeded", async () => {
    mockIsProUser.mockResolvedValue(false)
    mockGetEffectiveCap.mockResolvedValue(100)
    mockGetItemCount.mockResolvedValue(100)

    await expect(
      createItems({
        supabase: {} as any,
        userId: "user-1",
        items: [
          {
            itemData: {
              name: "Camera",
              is_wishlist: false,
            },
          },
        ],
      })
    ).rejects.toBeInstanceOf(ItemCapExceededError)
  })

  it("creates items when cap check is skipped", async () => {
    const selectMock = vi.fn().mockResolvedValue({
      data: [{ id: "item-1" }],
      error: null,
    })
    const insertMock = vi.fn().mockReturnValue({
      select: selectMock,
    })
    const fromMock = vi.fn().mockImplementation((table: string) => {
      if (table === "items") {
        return { insert: insertMock }
      }
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await createItems({
      supabase: { from: fromMock } as any,
      userId: "user-1",
      skipCapCheck: true,
      items: [
        {
          itemData: {
            name: "Lens",
            is_wishlist: false,
            user_id: "user-1",
          },
          currentValue: null,
        },
      ],
    })

    expect(result.itemIds).toEqual(["item-1"])
    expect(result.operations).toContain("created 1 item(s)")
  })
})
