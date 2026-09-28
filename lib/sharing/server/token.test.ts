import { describe, expect, it, vi } from "vitest"
import { createPublicReadCore } from "./read-core"

const owner = "c1000000-0000-4000-8000-000000000001"
const token = "c4000000-0000-4000-8000-000000000001"
const secret = "test-only-secret-at-least-thirty-two-bytes"
const context = { revision: "3", viewerCategory: "guest", profile: { id: owner, nickname: "Collector", bio: "", avatar: null, sharedStyle: null, relationship: "none" } }
const response = (data: unknown) => ({ data: { ok: true, data }, error: null })

describe("public wishlist token alias", () => {
  it("resolves a token to the owner wishlist without treating it as an extra grant", async () => {
    const rpc = vi.fn().mockResolvedValueOnce(response({ ownerId: owner }))
      .mockResolvedValueOnce(response(context))
      .mockResolvedValueOnce(response({ revision: "3", viewerCategory: "guest", rows: [] }))
    const result = await createPublicReadCore(rpc, secret).tokenWishlist(token, { kind: "guest" }, {})
    expect(result).toEqual({ ok: true, data: { entries: [], nextCursor: null, hasMore: false } })
    expect(rpc.mock.calls[0][0]).toBe("sharing_resolve_wishlist_token")
    expect(rpc.mock.calls[0][1]).toEqual({ p_token: token, p_viewer_id: null })
    expect(rpc.mock.calls[2][0]).toBe("sharing_read_page")
    expect(rpc.mock.calls[2][1].p_owner_id).toBe(owner)
    expect(rpc.mock.calls[2][1].p_viewer_id).toBeNull()
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("SECRET")
  })
  it("rejects malformed tokens before privileged resolution", async () => {
    const rpc = vi.fn()
    expect(await createPublicReadCore(rpc, secret).tokenWishlist("bad token!", { kind: "guest" }, {}))
      .toEqual({ ok: false, error: { code: "invalid_input", status: 400 } })
    expect(rpc).not.toHaveBeenCalled()
  })
  it("keeps blocked and unknown tokens as generic not-found", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: false, error: { code: "not_found", status: 404, token } }, error: null })
    const result = await createPublicReadCore(rpc, secret).tokenWishlist(token, { kind: "authenticated", userId: owner }, {})
    expect(result).toEqual({ ok: false, error: { code: "not_found", status: 404 } })
    expect(JSON.stringify(result)).not.toContain(token)
    expect(rpc.mock.calls[0][1].p_viewer_id).toBe(owner)
    expect(rpc).toHaveBeenCalledOnce()
  })
})
