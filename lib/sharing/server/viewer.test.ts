import { describe, expect, it, vi } from "vitest"
import { GUEST_VIEWER } from "../contracts"
import { publishedViewerOrGuest, resolvePublishedViewer } from "./viewer"

describe("verified public viewer", () => {
  it("allows a genuine guest without auth calls", async () => {
    const auth = { getUser: vi.fn() }
    expect(await resolvePublishedViewer(auth, null, false)).toEqual({ ok: true, data: GUEST_VIEWER })
    expect(auth.getUser).not.toHaveBeenCalled()
  })
  it("treats expired or invalid cookies as guests on published reads", async () => {
    const auth = { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error("expired") }) }
    expect(await resolvePublishedViewer(auth, null, true)).toEqual({ ok: true, data: GUEST_VIEWER })
  })
  it("verifies explicit bearer token rather than treating it as a guest", async () => {
    const auth = { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "verified" } }, error: null }) }
    expect(await resolvePublishedViewer(auth, "Bearer signed-token", false)).toEqual({ ok: true, data: { kind: "authenticated", userId: "verified" } })
    expect(auth.getUser).toHaveBeenCalledWith("signed-token")
  })
  it("denies malformed authorization even with cookies present", async () => {
    const auth = { getUser: vi.fn() }
    expect((await resolvePublishedViewer(auth, "Basic credentials", true)).ok).toBe(false)
    expect(auth.getUser).not.toHaveBeenCalled()
  })
  it("does not trust a user id when auth reports an error", async () => {
    const auth = { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "stale" } }, error: new Error("failed") }) }
    expect(await resolvePublishedViewer(auth, null, true)).toEqual({ ok: true, data: GUEST_VIEWER })
  })
  it("keeps failed bearer credentials as authentication errors for JSON clients", async () => {
    const auth = { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error("expired") }) }
    expect(await resolvePublishedViewer(auth, "Bearer stale", false)).toEqual({ ok: false, error: { code: "authentication_required", status: 401 } })
  })
  it("lets HTML published surfaces continue as guest after a bearer failure", () => {
    expect(publishedViewerOrGuest({ ok: false, error: { code: "authentication_required", status: 401 } })).toEqual(GUEST_VIEWER)
  })
})
