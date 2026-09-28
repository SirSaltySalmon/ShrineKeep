import { describe, expect, it } from "vitest"
import { decodeCursor, encodeCursor, type CursorScope } from "./cursor"

const secret = "test-only-cursor-secret-with-32-bytes-minimum"
const scope: CursorScope = { ownerId: "owner", viewer: { kind: "authenticated", userId: "friend" }, viewerCategory: "friend", surface: "boxes", sort: "position,id", search: "", filters: "parent=root", revision: "9007199254740993" }
const lastKey = { value: 0, id: "box-id" }

describe("signed cursor boundaries", () => {
  it("round trips zero sort values and bigint revisions", () => {
    expect(decodeCursor(encodeCursor(scope, lastKey, secret), scope, secret)).toEqual({ ok: true, cursor: { ...scope, version: 1, lastKey } })
  })
  it("rejects tampering, malformed input, wrong keys, and oversized tokens", () => {
    const token = encodeCursor(scope, lastKey, secret)
    for (const bad of [`A${token.slice(1)}`, "{}", "x".repeat(4097)]) expect(decodeCursor(bad, scope, secret)).toEqual({ ok: false, code: "invalid_input" })
    expect(decodeCursor(token, scope, `${secret}-wrong`)).toEqual({ ok: false, code: "invalid_input" })
  })
  it("binds every query boundary and returns reset on changed revision", () => {
    const token = encodeCursor(scope, lastKey, secret)
    const changes: Partial<CursorScope>[] = [{ ownerId: "other" }, { viewer: { kind: "guest" } }, { viewer: { kind: "authenticated", userId: "other" } }, { viewerCategory: "stranger" }, { surface: "wishlist" }, { sort: "name,id" }, { search: "new" }, { filters: "parent=child" }]
    for (const change of changes) expect(decodeCursor(token, { ...scope, ...change }, secret)).toEqual({ ok: false, code: "invalid_input" })
    expect(decodeCursor(token, { ...scope, revision: "9007199254740994" }, secret)).toEqual({ ok: false, code: "cursor_reset" })
  })
  it("fails closed on missing/short signing configuration", () => {
    expect(() => encodeCursor(scope, lastKey, "")).toThrow("at least 32 bytes")
  })
})
