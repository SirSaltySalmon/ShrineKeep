import { describe, expect, it } from "vitest"
import { ItemCapExceededError, itemCapErrorFromDb, itemCapResponse } from "./item-cap-error"

describe("itemCapErrorFromDb", () => {
  it("maps the database cap trigger error", () => {
    const mapped = itemCapErrorFromDb({ code: "P0001", message: "item_limit_reached:100:100" })
    expect(mapped).toBeInstanceOf(ItemCapExceededError)
    expect(mapped?.currentCount).toBe(100)
    expect(mapped?.cap).toBe(100)
  })

  it("maps the error as PostgREST returns it from an insert, update or rpc", () => {
    const mapped = itemCapErrorFromDb({
      code: "P0001",
      message: "item_limit_reached:102:150",
      details: null,
      hint: null,
    })
    expect(mapped?.currentCount).toBe(102)
    expect(mapped?.cap).toBe(150)
  })

  it("ignores unrelated errors", () => {
    expect(itemCapErrorFromDb({ code: "P0001", message: "privacy_conflict" })).toBeNull()
    expect(itemCapErrorFromDb(null)).toBeNull()
    expect(itemCapErrorFromDb("item_limit_reached")).toBeNull()
    expect(itemCapErrorFromDb(new Error("item_limit_reached:1:2"))).toBeNull()
  })

  it("ignores a different database error that echoes the cap text", () => {
    expect(
      itemCapErrorFromDb({
        code: "22P02",
        message: 'invalid input syntax for type numeric: "item_limit_reached:1:2"',
      })
    ).toBeNull()
    expect(itemCapErrorFromDb({ code: "22P02", message: "item_limit_reached:1:2" })).toBeNull()
    expect(itemCapErrorFromDb({ message: "item_limit_reached:1:2" })).toBeNull()
  })

  it("requires the whole message to be the cap error", () => {
    expect(
      itemCapErrorFromDb({ code: "P0001", message: "failed: item_limit_reached:1:2" })
    ).toBeNull()
    expect(
      itemCapErrorFromDb({ code: "P0001", message: "item_limit_reached:1:2 while pasting" })
    ).toBeNull()
    expect(itemCapErrorFromDb({ code: "P0001", message: "item_limit_reached:1:" })).toBeNull()
  })
})

describe("itemCapResponse", () => {
  const body = { error: "item_limit_reached", currentCount: 100, cap: 100 }

  it("answers 403 for an ItemCapExceededError", async () => {
    const response = itemCapResponse(new ItemCapExceededError(100, 100))
    expect(response?.status).toBe(403)
    await expect(response?.json()).resolves.toEqual(body)
  })

  it("answers 403 for the raw database error", async () => {
    const response = itemCapResponse({ code: "P0001", message: "item_limit_reached:100:100" })
    expect(response?.status).toBe(403)
    await expect(response?.json()).resolves.toEqual(body)
  })

  it("returns null for anything else", () => {
    expect(itemCapResponse(new Error("boom"))).toBeNull()
    expect(itemCapResponse({ code: "P0001", message: "privacy_conflict" })).toBeNull()
    expect(itemCapResponse(undefined)).toBeNull()
  })
})
