import { describe, expect, it } from "vitest"
import { ItemCapExceededError, itemCapErrorFromDb } from "./item-cap-error"

describe("itemCapErrorFromDb", () => {
  it("maps the database cap trigger error", () => {
    const mapped = itemCapErrorFromDb({ code: "P0001", message: "item_limit_reached:100:100" })
    expect(mapped).toBeInstanceOf(ItemCapExceededError)
    expect(mapped?.currentCount).toBe(100)
    expect(mapped?.cap).toBe(100)
  })

  it("ignores unrelated errors", () => {
    expect(itemCapErrorFromDb({ code: "P0001", message: "privacy_conflict" })).toBeNull()
    expect(itemCapErrorFromDb(null)).toBeNull()
    expect(itemCapErrorFromDb("item_limit_reached")).toBeNull()
  })
})
