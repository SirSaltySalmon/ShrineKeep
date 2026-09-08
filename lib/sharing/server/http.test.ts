import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { publicReadResponse } from "./http"
import { GET as preview } from "@/app/api/wishlist/preview/route"
import { GET as collectionDetail } from "@/app/api/public/users/[userId]/items/[itemId]/route"
import { GET as wishlistDetail } from "@/app/api/public/users/[userId]/wishlist/[itemId]/route"
import { GET as profile } from "@/app/api/public/users/[userId]/route"

const mocks = vi.hoisted(() => ({ cookies: vi.fn(), getUser: vi.fn(), rpc: vi.fn(), service: vi.fn() }))
vi.mock("next/headers", () => ({ cookies: mocks.cookies }))
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser } }) }))
vi.mock("@/lib/supabase/service", () => ({ createSupabaseServiceClient: mocks.service }))
const owner = "61000000-0000-4000-8000-000000000001"

describe("public HTTP boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv("SOCIAL_PUBLIC_READS_ENABLED", "true")
    vi.stubEnv("SHARING_CURSOR_SECRET", "test-only-secret-longer-than-thirty-two-bytes")
    mocks.cookies.mockResolvedValue({ getAll: () => [] })
    mocks.service.mockReturnValue({ rpc: mocks.rpc })
  })
  afterEach(() => vi.unstubAllEnvs())

  it.each(["items", "wishlist"] as const)("wires %s details to the verified viewer and safe response", async surface => {
    const itemId = "61000000-0000-4000-8000-000000000002"
    const profile = { id: owner, nickname: "Collector", bio: "", avatar: null, sharedStyle: null, relationship: "none" }
    const item = { id: itemId, name: "Visible", description: null, thumbnail: null,
      ...(surface === "items" ? { currentValue: null, acquisitionPrice: null, acquisitionDate: null } : { expectedPrice: 0, visibleTarget: null }) }
    mocks.rpc.mockResolvedValueOnce({ data: { ok: true, data: { revision: "0", viewerCategory: "guest", profile } }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, data: { revision: "0", viewerCategory: "guest", item, photos: [], tags: [] } }, error: null })
    const route = surface === "items" ? collectionDetail : wishlistDetail
    const result = await route(new NextRequest(`http://localhost/api/public/users/${owner}/${surface}/${itemId}?viewerId=${owner}`), { params: Promise.resolve({ userId: owner, itemId }) })
    expect(result.status).toBe(200)
    expect(result.headers.get("cache-control")).toContain("no-store")
    expect(mocks.rpc.mock.calls[1][1]).toMatchObject({ p_owner_id: owner, p_item_id: itemId, p_surface: surface, p_viewer_id: null })
    expect(await result.json()).toEqual({ item, photos: { entries: [], nextCursor: null, hasMore: false }, tags: { entries: [], nextCursor: null, hasMore: false } })
  })

  it("hydrates profile avatar and style through the verified guest viewer", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { ok: true, data: { revision: "0", viewerCategory: "guest", profile: {
        id: owner, nickname: "Collector", bio: "", avatar: null, avatarReferenceId: owner, relationship: "none",
        sharedStyle: { colorScheme: { background: "0 0% 100%" }, headerFontFamily: "Lora", bodyFontFamily: "Inter", borderRadius: "0.5rem" },
      } } }, error: null,
    }).mockResolvedValueOnce({
      data: { ok: true, data: { kind: "uploaded", referenceId: owner, bucket: "avatars", objectPath: `${owner}/avatars/v1.png` } }, error: null,
    })
    mocks.service.mockReturnValue({
      rpc: mocks.rpc,
      storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "https://signed.test/avatar" }, error: null }) }) },
    })
    const result = await profile(new NextRequest(`http://localhost/api/public/users/${owner}?viewerId=${owner}`), { params: Promise.resolve({ userId: owner }) })
    expect(result.status).toBe(200)
    const body = await result.json()
    expect(body.avatar).toEqual({ referenceId: owner, url: "https://signed.test/avatar", expiresAt: expect.any(String) })
    expect(body.sharedStyle.headerFontFamily).toBe("Lora")
    expect(JSON.stringify(body)).not.toContain("objectPath")
    expect(mocks.rpc.mock.calls[0][0]).toBe("sharing_read_context")
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_owner_id: owner, p_viewer_id: null })
    expect(mocks.rpc.mock.calls[1][0]).toBe("media_authorize_reference")
    expect(mocks.rpc.mock.calls[1][1]).toMatchObject({ p_kind: "avatar", p_reference_id: owner, p_viewer_id: null })
  })

  it("defaults feature off without touching auth or service client", async () => {
    vi.stubEnv("SOCIAL_PUBLIC_READS_ENABLED", "false")
    const run = vi.fn()
    const result = await publicReadResponse(new NextRequest("http://localhost/api/public/users/x"), run)
    expect(result.status).toBe(404)
    expect(run).not.toHaveBeenCalled()
    expect(mocks.service).not.toHaveBeenCalled()
  })

  it("sets private no-store headers on guest responses", async () => {
    const run = vi.fn().mockResolvedValue({ ok: true, data: { entries: [] } })
    const result = await publicReadResponse(new NextRequest("http://localhost/api/public/users/x"), run)
    expect(result.status).toBe(200)
    expect(result.headers.get("cache-control")).toContain("no-store")
    expect(result.headers.get("vary")).toBe("Cookie, Authorization")
    expect(run.mock.calls[0][1]).toEqual({ kind: "guest" })
  })

  it("rejects expired auth cookies without guest fallback", async () => {
    mocks.cookies.mockResolvedValue({ getAll: () => [{ name: "sb-project-auth-token.0", value: "expired" }] })
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error("expired") })
    const run = vi.fn()
    const result = await publicReadResponse(new NextRequest("http://localhost/api/public/users/x"), run)
    expect(result.status).toBe(401)
    expect(run).not.toHaveBeenCalled()
    expect(mocks.service).not.toHaveBeenCalled()
    expect(result.headers.get("cache-control")).toContain("no-store")
  })

  it("requires authentication for public preview", async () => {
    expect((await preview(new NextRequest("http://localhost/api/wishlist/preview"))).status).toBe(401)
    expect(mocks.service).not.toHaveBeenCalled()
  })

  it("preview ignores requested identities and uses verified owner's forced-guest reads", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: owner } }, error: null })
    mocks.rpc.mockResolvedValueOnce({ error: null, data: { ok: true, data: { revision: "0", viewerCategory: "guest", profile: { id: owner, nickname: "Collector", bio: "", avatar: null, sharedStyle: null, relationship: "none" } } } })
      .mockResolvedValueOnce({ error: null, data: { ok: true, data: { revision: "0", viewerCategory: "guest", rows: [] } } })
    const result = await preview(new NextRequest("http://localhost/api/wishlist/preview?ownerId=other&viewerId=other", { headers: { authorization: "Bearer verified-token" } }))
    expect(result.status).toBe(200)
    expect(mocks.getUser).toHaveBeenCalledWith("verified-token")
    expect(mocks.rpc.mock.calls.every(call => call[1].p_owner_id === owner && call[1].p_viewer_id === null)).toBe(true)
  })

  it("returns generic unavailable errors without leaking infrastructure failures", async () => {
    mocks.service.mockImplementation(() => { throw new Error("PRIVATE database detail") })
    const result = await publicReadResponse(new NextRequest("http://localhost/api/public/users/x"), vi.fn())
    expect(result.status).toBe(503)
    expect(await result.text()).not.toContain("PRIVATE")
  })
})
