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

/** A client whose items insert answers `insertResult`, or echoes one id per inserted row. */
function makeSupabase(insertResult?: { data: Array<{ id: string }> | null; error: unknown }) {
  const insert = vi.fn((rows: unknown[]) => ({
    select: vi.fn().mockResolvedValue(
      insertResult ?? { data: rows.map((_, i) => ({ id: `item-${i + 1}` })), error: null }
    ),
  }))
  const from = vi.fn((table: string) => {
    if (table === "items") return { insert }
    throw new Error(`Unexpected table: ${table}`)
  })
  return { supabase: { from } as any, insert }
}

const collectionItem = (name: string) => ({
  itemData: { name, is_wishlist: false, user_id: "user-1" },
})
const wishlistItem = (name: string) => ({
  itemData: { name, is_wishlist: true, user_id: "user-1" },
})

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

  describe("free-tier pre-count", () => {
    beforeEach(() => {
      mockIsProUser.mockResolvedValue(false)
      mockGetEffectiveCap.mockResolvedValue(100)
    })

    it("creates the item that fills the last slot", async () => {
      mockGetItemCount.mockResolvedValue(99)
      const { supabase, insert } = makeSupabase()

      const result = await createItems({
        supabase,
        userId: "user-1",
        items: [collectionItem("Lens")],
      })

      expect(result.itemIds).toEqual(["item-1"])
      expect(result.operations).toContain("created 1 item(s)")
      expect(insert).toHaveBeenCalledTimes(1)
    })

    it("rejects a create at the cap before inserting", async () => {
      mockGetItemCount.mockResolvedValue(100)
      const { supabase, insert } = makeSupabase()

      const attempt = createItems({
        supabase,
        userId: "user-1",
        items: [collectionItem("Camera")],
      })

      await expect(attempt).rejects.toBeInstanceOf(ItemCapExceededError)
      await expect(attempt).rejects.toMatchObject({ currentCount: 100, cap: 100 })
      expect(insert).not.toHaveBeenCalled()
    })

    it("rejects a batch that would cross the cap", async () => {
      mockGetItemCount.mockResolvedValue(99)
      const { supabase, insert } = makeSupabase()

      await expect(
        createItems({
          supabase,
          userId: "user-1",
          items: [collectionItem("Camera"), collectionItem("Lens")],
        })
      ).rejects.toMatchObject({ currentCount: 99, cap: 100 })
      expect(insert).not.toHaveBeenCalled()
    })

    it("does not count wishlist items in the batch against the cap", async () => {
      mockGetItemCount.mockResolvedValue(99)
      const { supabase } = makeSupabase()

      const result = await createItems({
        supabase,
        userId: "user-1",
        items: [collectionItem("Lens"), wishlistItem("Tripod"), wishlistItem("Flash")],
      })

      expect(result.itemIds).toHaveLength(3)
    })

    it("skips the cap check entirely for a wishlist-only batch", async () => {
      mockGetItemCount.mockResolvedValue(100)
      const { supabase } = makeSupabase()

      const result = await createItems({
        supabase,
        userId: "user-1",
        items: [wishlistItem("Tripod")],
      })

      expect(result.itemIds).toEqual(["item-1"])
      expect(mockIsProUser).not.toHaveBeenCalled()
      expect(mockGetItemCount).not.toHaveBeenCalled()
    })

    it("does not cap Pro users", async () => {
      mockIsProUser.mockResolvedValue(true)
      mockGetEffectiveCap.mockResolvedValue(Infinity)
      mockGetItemCount.mockResolvedValue(5000)
      const { supabase } = makeSupabase()

      const result = await createItems({
        supabase,
        userId: "user-1",
        items: [collectionItem("Lens")],
      })

      expect(result.itemIds).toEqual(["item-1"])
      expect(mockGetEffectiveCap).toHaveBeenCalledWith(supabase, "user-1", true)
    })
  })

  describe("database errors from the insert", () => {
    beforeEach(() => {
      // The pre-count passes; the trigger is what rejects (a concurrent create took the slot).
      mockIsProUser.mockResolvedValue(false)
      mockGetEffectiveCap.mockResolvedValue(100)
      mockGetItemCount.mockResolvedValue(99)
    })

    it("maps the cap trigger's rejection to ItemCapExceededError", async () => {
      const { supabase } = makeSupabase({
        data: null,
        error: { code: "P0001", message: "item_limit_reached:100:100" },
      })

      const attempt = createItems({
        supabase,
        userId: "user-1",
        items: [collectionItem("Camera")],
      })

      await expect(attempt).rejects.toBeInstanceOf(ItemCapExceededError)
      await expect(attempt).rejects.toMatchObject({ currentCount: 100, cap: 100 })
    })

    it("rethrows any other database error untouched", async () => {
      const dbError = {
        code: "22P02",
        message: 'invalid input syntax for type numeric: "item_limit_reached:1:2"',
      }
      const { supabase } = makeSupabase({ data: null, error: dbError })

      await expect(
        createItems({
          supabase,
          userId: "user-1",
          items: [collectionItem("Camera")],
        })
      ).rejects.toBe(dbError)
    })
  })
})
