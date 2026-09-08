import { describe, expect, it, vi } from "vitest"
import { SHARING_LIMITS } from "../contracts"
import { createPublicReadCore } from "./read-core"

const owner = "51000000-0000-4000-8000-000000000001"
const friend = "51000000-0000-4000-8000-000000000002"
const secret = "test-only-cursor-signing-secret-at-least-32-bytes"
const pageSize = SHARING_LIMITS.publicPageSize
const overFetch = pageSize + 1
const context = { revision: "0", viewerCategory: "guest", profile: { id: owner, nickname: "Collector-00000001", bio: "", avatar: null, sharedStyle: null, relationship: "none", email: "PRIVATE" } }
const row = (n: number) => ({ key: { value: "2026-01-01T00:00:00.123456+00:00", id: `52000000-0000-4000-8000-${String(n).padStart(12, "0")}` },
  item: { id: `52000000-0000-4000-8000-${String(n).padStart(12, "0")}`, name: `Wish ${n}`, description: null, thumbnail: null, expectedPrice: 0, visibleTarget: null, acquisitionPrice: 999, storage_path: "PRIVATE" } })
const response = (data: unknown) => ({ data: { ok: true, data }, error: null })

describe("public read adapter boundaries", () => {
  it("strips extra fields and signs bounded pagination, preserving timestamp precision", async () => {
    const rpc = vi.fn().mockResolvedValueOnce(response(context)).mockResolvedValueOnce(response({ revision: "0", viewerCategory: "guest", rows: Array.from({ length: overFetch }, (_, i) => row(i + 1)) }))
    const service = createPublicReadCore(rpc, secret)
    const result = await service.wishlist(owner, { kind: "guest" }, {})
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.entries).toHaveLength(pageSize)
    expect(result.data.hasMore).toBe(true)
    expect(JSON.stringify(result.data.entries)).not.toMatch(/PRIVATE|acquisitionPrice|storage_path|"key"/)
    expect(result.data.entries[0].expectedPrice).toBe(0)
    rpc.mockResolvedValueOnce(response(context)).mockResolvedValueOnce(response({ revision: "0", viewerCategory: "guest", rows: [] }))
    await service.wishlist(owner, { kind: "guest" }, { cursor: result.data.nextCursor! })
    expect(rpc.mock.calls[3][1].p_after_key).toEqual(row(pageSize).key)
    expect(rpc.mock.calls[3][1].p_expected_revision).toBe("0")
  })

  it("preview derives owner from trusted argument and always uses guest context", async () => {
    const rpc = vi.fn().mockResolvedValueOnce(response(context)).mockResolvedValueOnce(response({ revision: "0", viewerCategory: "guest", rows: [] }))
    await createPublicReadCore(rpc, secret).previewWishlist(owner, {})
    expect(rpc.mock.calls.every(call => call[1].p_owner_id === owner && call[1].p_viewer_id === null)).toBe(true)
  })

  it("does not downgrade denied signed-in requests to guest", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: false, error: { code: "not_found", status: 404, reason: "private block data" } }, error: null })
    expect(await createPublicReadCore(rpc, secret).wishlist(owner, { kind: "authenticated", userId: friend }, {})).toEqual({ ok: false, error: { code: "not_found", status: 404 } })
    expect(rpc).toHaveBeenCalledOnce()
    expect(rpc.mock.calls[0][1].p_viewer_id).toBe(friend)
  })

  it("strips private identity fields", async () => {
    const rpc = vi.fn().mockResolvedValue(response(context))
    const result = await createPublicReadCore(rpc, secret).profile(owner, { kind: "guest" })
    expect(result.ok).toBe(true)
    expect(JSON.stringify(result)).not.toContain("PRIVATE")
  })

  it("rejects malformed DTOs and overlong backend pages as not found", async () => {
    for (const rows of [[{ ...row(1), item: { ...row(1).item, expectedPrice: "999" } }], Array.from({ length: overFetch + 1 }, (_, i) => row(i + 1))]) {
      const rpc = vi.fn().mockResolvedValueOnce(response(context)).mockResolvedValueOnce(response({ revision: "0", viewerCategory: "guest", rows }))
      expect(await createPublicReadCore(rpc, secret).wishlist(owner, { kind: "guest" }, {})).toEqual({ ok: false, error: { code: "not_found", status: 404 } })
    }
  })

  it("keeps RPC transport failures as unavailable", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "connection refused" } })
    expect(await createPublicReadCore(rpc, secret).wishlist(owner, { kind: "guest" }, {})).toEqual({ ok: false, error: { code: "temporarily_unavailable", status: 503 } })
  })

  it("validates request identity before any privileged call", async () => {
    const rpc = vi.fn()
    expect(await createPublicReadCore(rpc, secret).wishlist("not-uuid", { kind: "guest" }, {})).toEqual({ ok: false, error: { code: "invalid_input", status: 400 } })
    expect(rpc).not.toHaveBeenCalled()
  })

  it("rejects changed revision between authorization and page reads", async () => {
    const rpc = vi.fn().mockResolvedValueOnce(response(context)).mockResolvedValueOnce({ data: { ok: false, error: { code: "cursor_reset", status: 409 } }, error: null })
    expect(await createPublicReadCore(rpc, secret).wishlist(owner, { kind: "guest" }, {})).toEqual({ ok: false, error: { code: "cursor_reset", status: 409 } })
  })
})
