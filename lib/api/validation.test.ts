import { describe, expect, it, vi } from "vitest"
import {
  validateBoxesBelongToUser,
  validateItemsBelongToUser,
  validateTags,
} from "./validation"

function makeSupabaseWithRows(expectedTable: string, rows: Array<{ id: string }>) {
  const result = { data: rows, error: null }
  const query = {
    eq: vi.fn().mockImplementation(() => ({
      in: vi.fn().mockResolvedValue(result),
    })),
    in: vi.fn().mockImplementation(() => ({
      eq: vi.fn().mockResolvedValue(result),
    })),
  }
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table !== expectedTable) {
        throw new Error(`Unexpected table ${table}`)
      }
      return {
        select: vi.fn().mockReturnValue(query),
      }
    }),
  } as any
}

describe("validation helpers", () => {
  it("validates tag ownership and returns matched ids", async () => {
    const supabase = makeSupabaseWithRows("tags", [{ id: "tag-1" }])
    const result = await validateTags(supabase, "user-1", ["tag-1", "tag-2"])
    expect(Array.from(result)).toEqual(["tag-1"])
  })

  it("validates item ownership and returns matched ids", async () => {
    const supabase = makeSupabaseWithRows("items", [{ id: "item-1" }, { id: "item-2" }])
    const result = await validateItemsBelongToUser(supabase, "user-1", ["item-1", "item-2"])
    expect(Array.from(result).sort()).toEqual(["item-1", "item-2"])
  })

  it("validates box ownership and returns matched ids", async () => {
    const supabase = makeSupabaseWithRows("boxes", [{ id: "box-1" }])
    const result = await validateBoxesBelongToUser(supabase, "user-1", ["box-1", "box-x"])
    expect(Array.from(result)).toEqual(["box-1"])
  })
})
