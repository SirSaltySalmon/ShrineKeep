import { describe, expect, it, vi } from "vitest"
import { resolvePublishedViewer } from "./viewer"

describe("verified public viewer", () => {
  it("allows a genuine guest without auth calls", async () => {
    const auth = { getUser: vi.fn() }
    expect(await resolvePublishedViewer(auth, null, false)).toEqual({ ok: true, data: { kind: "guest" } })
    expect(auth.getUser).not.toHaveBeenCalled()
  })
  it("denies expired or invalid supplied cookies", async () => {
    const auth = { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error("expired") }) }
    expect(await resolvePublishedViewer(auth, null, true)).toEqual({ ok: false, error: { code: "authentication_required", status: 401 } })
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
  it("requires both a verified user and absence of auth errors", async () => {
    const auth = { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "stale" } }, error: new Error("failed") }) }
    expect((await resolvePublishedViewer(auth, null, true)).ok).toBe(false)
  })
})
