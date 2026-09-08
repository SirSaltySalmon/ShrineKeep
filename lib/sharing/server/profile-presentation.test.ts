import { describe, expect, it, vi } from "vitest"
import { createPublicReadCore } from "./read-core"

const owner = "b1000000-0000-4000-8000-000000000001"
const secret = "test-only-secret-at-least-thirty-two-bytes"
const response = (data: unknown) => ({ data: { ok: true, data }, error: null })
const profile = {
  id: owner, nickname: "Collector", bio: "", avatar: null, avatarReferenceId: owner, relationship: "none",
  email: "PRIVATE", wishlist_share_token: "SECRET-TOKEN",
  sharedStyle: {
    colorScheme: { background: "0 0% 100%", evil: "url(https://SECRET.invalid)", radius: "9rem" },
    headerFontFamily: "Lora", bodyFontFamily: "not-a-font", borderRadius: "0.75rem", graph_overlay: false,
  },
}
const media = () => vi.fn(async (kind: string, referenceId: string) => ({
  ok: true as const, data: { referenceId, url: `https://signed.test/${kind}/${referenceId}`, expiresAt: "2026-09-08T00:01:00Z" },
}))

describe("public profile presentation", () => {
  it("signs owner avatars and allowlists shared style without private settings", async () => {
    const resolve = media()
    const rpc = vi.fn().mockResolvedValue(response({ revision: "1", viewerCategory: "guest", profile }))
    const result = await createPublicReadCore(rpc, secret, resolve).profile(owner, { kind: "guest" })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.avatar).toEqual({ referenceId: owner, url: `https://signed.test/avatar/${owner}`, expiresAt: "2026-09-08T00:01:00Z" })
    expect(result.data.sharedStyle).toEqual({
      colorScheme: { background: "0 0% 100%" }, headerFontFamily: "Lora", bodyFontFamily: null, borderRadius: "0.75rem",
    })
    expect(JSON.stringify(result.data)).not.toMatch(/PRIVATE|SECRET|graph_overlay|avatarReferenceId|evil/)
    expect(resolve.mock.calls).toEqual([["avatar", owner, { kind: "guest" }]])
  })
  it("does not authorize avatars while paging lists", async () => {
    const resolve = media()
    const rpc = vi.fn().mockResolvedValueOnce(response({ revision: "1", viewerCategory: "guest", profile }))
      .mockResolvedValueOnce(response({ revision: "1", viewerCategory: "guest", rows: [] }))
    await createPublicReadCore(rpc, secret, resolve).boxes(owner, { kind: "guest" }, {})
    expect(resolve).not.toHaveBeenCalled()
  })
  it("omits missing avatars and fails infrastructure errors", async () => {
    const rpc = vi.fn().mockResolvedValue(response({ revision: "1", viewerCategory: "guest", profile }))
    const missing = vi.fn().mockResolvedValue({ ok: false, error: { code: "not_found", status: 404 } })
    const first = await createPublicReadCore(rpc, secret, missing).profile(owner, { kind: "guest" })
    expect(first.ok && first.data.avatar).toBeNull()
    missing.mockResolvedValue({ ok: false, error: { code: "temporarily_unavailable", status: 503 } })
    expect(await createPublicReadCore(rpc, secret, missing).profile(owner, { kind: "guest" }))
      .toEqual({ ok: false, error: { code: "temporarily_unavailable", status: 503 } })
  })
  it("rejects avatar references that are not the owner id", async () => {
    const resolve = media()
    const rpc = vi.fn().mockResolvedValue(response({
      revision: "1", viewerCategory: "guest",
      profile: { ...profile, avatarReferenceId: "b1000000-0000-4000-8000-000000000099" },
    }))
    expect(await createPublicReadCore(rpc, secret, resolve).profile(owner, { kind: "guest" }))
      .toEqual({ ok: false, error: { code: "temporarily_unavailable", status: 503 } })
    expect(resolve).not.toHaveBeenCalled()
  })
})
