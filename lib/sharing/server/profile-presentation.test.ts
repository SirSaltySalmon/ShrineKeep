import { describe, expect, it, vi } from "vitest"
import { createPublicReadCore } from "./read-core"

const owner = "b1000000-0000-4000-8000-000000000001"
const other = "b1000000-0000-4000-8000-000000000099"
const secret = "test-only-secret-at-least-thirty-two-bytes"
const publicAvatar = `https://example.test/storage/v1/object/public/avatars/${owner}/avatar.jpg`
const response = (data: unknown) => ({ data: { ok: true, data }, error: null })
const profile = {
  id: owner, nickname: "Collector", bio: "", avatar: null, avatarUrl: publicAvatar, relationship: "none",
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
  it("publishes allowlisted avatar_url and shared style without private settings", async () => {
    const resolve = media()
    const rpc = vi.fn().mockResolvedValue(response({ revision: "1", viewerCategory: "guest", profile }))
    const result = await createPublicReadCore(rpc, secret, resolve).profile(owner, { kind: "guest" })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.avatar).toEqual({ referenceId: owner, url: publicAvatar, expiresAt: null })
    expect(result.data.sharedStyle).toEqual({
      colorScheme: { background: "0 0% 100%" }, headerFontFamily: "Lora", bodyFontFamily: null, borderRadius: "0.75rem",
    })
    expect(JSON.stringify(result.data)).not.toMatch(/PRIVATE|SECRET|graph_overlay|avatarUrl|avatarReferenceId|evil/)
    expect(resolve).not.toHaveBeenCalled()
  })
  it("does not authorize avatars while paging lists", async () => {
    const resolve = media()
    const rpc = vi.fn().mockResolvedValueOnce(response({ revision: "1", viewerCategory: "guest", profile }))
      .mockResolvedValueOnce(response({ revision: "1", viewerCategory: "guest", rows: [] }))
    await createPublicReadCore(rpc, secret, resolve).boxes(owner, { kind: "guest" }, {})
    expect(resolve).not.toHaveBeenCalled()
  })
  it("omits missing or unsafe avatar URLs without failing the profile", async () => {
    const rpc = vi.fn()
    const missing = await createPublicReadCore(
      rpc.mockResolvedValue(response({ revision: "1", viewerCategory: "guest", profile: { ...profile, avatarUrl: null } })),
      secret, media(),
    ).profile(owner, { kind: "guest" })
    expect(missing.ok && missing.data.avatar).toBeNull()
    const signed = `https://example.test/storage/v1/object/sign/avatars/${owner}/avatar.jpg?token=x`
    const unsafe = await createPublicReadCore(
      vi.fn().mockResolvedValue(response({ revision: "1", viewerCategory: "guest", profile: { ...profile, avatarUrl: signed } })),
      secret, media(),
    ).profile(owner, { kind: "guest" })
    expect(unsafe.ok && unsafe.data.avatar).toBeNull()
    const foreign = `https://example.test/storage/v1/object/public/avatars/${other}/avatar.jpg`
    const otherOwner = await createPublicReadCore(
      vi.fn().mockResolvedValue(response({ revision: "1", viewerCategory: "guest", profile: { ...profile, avatarUrl: foreign } })),
      secret, media(),
    ).profile(owner, { kind: "guest" })
    expect(otherOwner.ok && otherOwner.data.avatar).toBeNull()
  })
  it("accepts local public storage URLs and https provider avatars", async () => {
    const local = `http://127.0.0.1:54321/storage/v1/object/public/avatars/${owner}/avatars/v1.png`
    const first = await createPublicReadCore(
      vi.fn().mockResolvedValue(response({ revision: "1", viewerCategory: "guest", profile: { ...profile, avatarUrl: local } })),
      secret,
    ).profile(owner, { kind: "guest" })
    expect(first.ok && first.data.avatar).toEqual({ referenceId: owner, url: local, expiresAt: null })
    const provider = "https://lh3.googleusercontent.com/a/portrait"
    const second = await createPublicReadCore(
      vi.fn().mockResolvedValue(response({ revision: "1", viewerCategory: "guest", profile: { ...profile, avatarUrl: provider } })),
      secret,
    ).profile(owner, { kind: "guest" })
    expect(second.ok && second.data.avatar).toEqual({ referenceId: owner, url: provider, expiresAt: null })
  })
})
