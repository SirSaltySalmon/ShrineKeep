import { describe, expect, it, vi } from "vitest"
import {
  itemCreateTypeError,
  itemScalarTypeError,
  readJsonObject,
  validateBoxesBelongToUser,
  validateItemsBelongToUser,
  validateTags,
} from "./validation"

describe("readJsonObject", () => {
  const request = (body: string) => new Request("http://localhost/api", { method: "POST", body })

  it("returns the parsed object", async () => {
    await expect(readJsonObject(request('{"name":"Lens"}'))).resolves.toEqual({ name: "Lens" })
  })

  it("returns null for malformed JSON and for JSON that is not an object", async () => {
    for (const body of ["{not json", "", "null", "[1]", '"text"', "7"]) {
      await expect(readJsonObject(request(body))).resolves.toBeNull()
    }
  })
})

describe("item body type checks", () => {
  it("accepts well-formed fields, nulls and absent fields", () => {
    expect(itemScalarTypeError({})).toBeNull()
    expect(
      itemScalarTypeError({
        name: "Lens",
        description: null,
        current_value: 0,
        acquisition_date: "2026-11-18",
        acquisition_price: null,
        box_id: "box-1",
        wishlist_target_box_id: null,
        is_wishlist: false,
      })
    ).toBeNull()
    expect(
      itemCreateTypeError({
        name: "Lens",
        photos: [{ url: "https://example.com/p.jpg", is_thumbnail: true }, { url: "https://example.com/q.jpg" }],
        tag_ids: ["tag-1"],
        value_history: [{ value: 10, recorded_at: "2026-01-01T00:00:00Z" }],
      })
    ).toBeNull()
    expect(itemCreateTypeError({ name: "Lens", photos: null, tag_ids: null, value_history: null })).toBeNull()
  })

  it("names the first wrongly typed scalar", () => {
    expect(itemScalarTypeError({ name: 42 })).toBe("name must be a string")
    expect(itemScalarTypeError({ description: 1 })).toBe("description must be a string or null")
    expect(itemScalarTypeError({ expected_price: "9" })).toBe("expected_price must be a number or null")
    // JSON.parse("1e999") is Infinity.
    expect(itemScalarTypeError({ current_value: Infinity })).toBe("current_value must be a number or null")
    expect(itemScalarTypeError({ is_wishlist: "true" })).toBe("is_wishlist must be a boolean")
  })

  it("checks the lists a create body carries", () => {
    expect(itemCreateTypeError({ name: 42, photos: "x" })).toBe("name must be a string")
    expect(itemCreateTypeError({ photos: [null] })).toBe("photos must be an array of { url, is_thumbnail }")
    expect(itemCreateTypeError({ photos: [{ url: "u", is_thumbnail: "yes" }] })).toBe(
      "photos must be an array of { url, is_thumbnail }"
    )
    expect(itemCreateTypeError({ tag_ids: "tag-1" })).toBe("tag_ids must be an array of strings")
    expect(itemCreateTypeError({ value_history: [{ value: 1 }] })).toBe(
      "value_history must be an array of { value, recorded_at }"
    )
  })
})

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
