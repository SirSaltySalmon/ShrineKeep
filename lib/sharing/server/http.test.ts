import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { createPublishedReadCore, loadPublicProfilePage, loadTokenWishlistPage, publicReadResponse } from "./http"
import { GET as preview } from "@/app/api/wishlist/preview/route"
import { GET as collectionDetail } from "@/app/api/public/users/[userId]/items/[itemId]/route"
import { GET as wishlistDetail } from "@/app/api/public/users/[userId]/wishlist/[itemId]/route"
import { GET as tokenWishlist } from "@/app/api/public/wishlist/[token]/route"
import { GET as profile } from "@/app/api/public/users/[userId]/route"
import { GET as stats } from "@/app/api/public/users/[userId]/stats/route"

const mocks = vi.hoisted(() => ({ cookies: vi.fn(), headers: vi.fn(), getUser: vi.fn(), rpc: vi.fn(), service: vi.fn() }))
vi.mock("next/headers", () => ({ cookies: mocks.cookies, headers: mocks.headers }))
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { name: "Friend", is_sandbox: false }, error: null }),
        }),
      }),
    }),
  }),
}))
vi.mock("@/lib/supabase/service", () => ({ createSupabaseServiceClient: mocks.service }))
const owner = "61000000-0000-4000-8000-000000000001"
const friend = "61000000-0000-4000-8000-000000000003"
const blocked = "61000000-0000-4000-8000-000000000004"
const token = "c4000000-0000-4000-8000-000000000001"

describe("public HTTP boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv("SOCIAL_PUBLIC_READS_ENABLED", "true")
    vi.stubEnv("SHARING_CURSOR_SECRET", "test-only-secret-longer-than-thirty-two-bytes")
    mocks.cookies.mockResolvedValue({ getAll: () => [] })
    mocks.headers.mockResolvedValue({ get: () => null })
    mocks.service.mockReturnValue({ rpc: mocks.rpc })
  })
  afterEach(() => vi.unstubAllEnvs())

  it.each(["items", "wishlist"] as const)("wires %s details to the verified viewer and safe response", async surface => {
    const itemId = "61000000-0000-4000-8000-000000000002"
    const profile = { id: owner, nickname: "Collector", bio: "", avatar: null, sharedStyle: null, relationship: "none" }
    const item = { id: itemId, name: "Visible", description: null, thumbnail: null,
      ...(surface === "items" ? { currentValue: null, acquisitionPrice: null, acquisitionDate: null } : { expectedPrice: 0, visibleTarget: null }) }
    mocks.rpc.mockResolvedValueOnce({ data: { ok: true, data: { revision: "0", viewerCategory: "guest", profile } }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, data: { revision: "0", viewerCategory: "guest", item, photos: [] } }, error: null })
    const route = surface === "items" ? collectionDetail : wishlistDetail
    const result = await route(new NextRequest(`http://localhost/api/public/users/${owner}/${surface}/${itemId}?viewerId=${owner}`), { params: Promise.resolve({ userId: owner, itemId }) })
    expect(result.status).toBe(200)
    expect(result.headers.get("cache-control")).toContain("no-store")
    expect(mocks.rpc.mock.calls[1][1]).toMatchObject({ p_owner_id: owner, p_item_id: itemId, p_surface: surface, p_viewer_id: null })
    expect(await result.json()).toEqual({ item, photos: { entries: [], nextCursor: null, hasMore: false } })
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

  it("aliases a wishlist token through verified guest resolution", async () => {
    const token = "c4000000-0000-4000-8000-000000000001"
    const profile = { id: owner, nickname: "Collector", bio: "", avatar: null, sharedStyle: null, relationship: "none" }
    mocks.rpc.mockResolvedValueOnce({ data: { ok: true, data: { ownerId: owner } }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, data: { revision: "0", viewerCategory: "guest", profile } }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, data: { revision: "0", viewerCategory: "guest", rows: [] } }, error: null })
    const result = await tokenWishlist(new NextRequest(`http://localhost/api/public/wishlist/${token}?viewerId=${owner}`), { params: Promise.resolve({ token }) })
    expect(result.status).toBe(200)
    expect(result.headers.get("cache-control")).toContain("no-store")
    expect(mocks.rpc.mock.calls[0]).toEqual(["sharing_resolve_wishlist_token", { p_token: token, p_viewer_id: null }])
    expect(mocks.rpc.mock.calls[2][1]).toMatchObject({ p_owner_id: owner, p_surface: "wishlist", p_viewer_id: null })
    expect(await result.json()).toEqual({ entries: [], nextCursor: null, hasMore: false })
  })

  it("wires public stats to the verified viewer without query identities", async () => {
    const boxId = "61000000-0000-4000-8000-000000000002"
    mocks.rpc.mockResolvedValueOnce({
      data: { ok: true, data: {
        currentValue: 10, totalAcquisition: 10, bucket: "day",
        valueHistory: [{ date: "2024-01-01", value: 0 }],
        acquisitionHistory: [{ date: "2024-01-01", cumulativeAcquisition: 10 }],
        itemIds: ["SECRET"],
      } }, error: null,
    })
    const result = await stats(new NextRequest(`http://localhost/api/public/users/${owner}/stats?boxId=${boxId}&fromDate=2024-01-01&toDate=2024-01-03&viewerId=${owner}`), { params: Promise.resolve({ userId: owner }) })
    expect(result.status).toBe(200)
    expect(result.headers.get("cache-control")).toContain("no-store")
    expect(mocks.rpc.mock.calls[0]).toEqual(["sharing_read_stats", {
      p_owner_id: owner, p_viewer_id: null, p_box_id: boxId, p_from: "2024-01-01", p_to: "2024-01-03",
    }])
    expect(await result.json()).toEqual({
      currentValue: 10, totalAcquisition: 10, bucket: "day",
      valueHistory: [{ date: "2024-01-01", value: 0 }],
      acquisitionHistory: [{ date: "2024-01-01", cumulativeAcquisition: 10 }],
    })
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

  it("404s the token page when public reads are disabled without touching auth or service", async () => {
    vi.stubEnv("SOCIAL_PUBLIC_READS_ENABLED", "false")
    expect(await loadTokenWishlistPage(token)).toEqual({ ok: false })
    expect(await createPublishedReadCore()).toEqual({ ok: false, reason: "disabled" })
    expect(mocks.service).not.toHaveBeenCalled()
    expect(mocks.cookies).not.toHaveBeenCalled()
  })

  it("loads a guest token wishlist in-process with the verified guest viewer", async () => {
    const publicProfile = { id: owner, nickname: "Collector", bio: "", avatar: null, sharedStyle: null, relationship: "none" }
    const wish = { id: "61000000-0000-4000-8000-000000000005", name: "root public wish", description: null, thumbnail: null, expectedPrice: 0, visibleTarget: null }
    mocks.rpc
      .mockResolvedValueOnce({ data: { ok: true, data: { ownerId: owner } }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, data: { revision: "0", viewerCategory: "guest", profile: publicProfile } }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, data: { revision: "0", viewerCategory: "guest", rows: [{ item: wish, key: { value: "2026-01-01T00:00:00.000Z", id: wish.id } }] } }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, data: { ownerId: owner } }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, data: { revision: "0", viewerCategory: "guest", profile: publicProfile } }, error: null })
    const result = await loadTokenWishlistPage(token)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.viewer).toEqual({ kind: "guest" })
    expect(result.page.entries).toEqual([wish])
    expect(result.profile.nickname).toBe("Collector")
    expect(mocks.rpc.mock.calls[0]).toEqual(["sharing_resolve_wishlist_token", { p_token: token, p_viewer_id: null }])
    expect(mocks.rpc.mock.calls[2][1]).toMatchObject({ p_owner_id: owner, p_surface: "wishlist", p_viewer_id: null })
  })

  it("passes a signed-in friend through to friends-only token entries", async () => {
    mocks.cookies.mockResolvedValue({ getAll: () => [{ name: "sb-project-auth-token", value: "ok" }] })
    mocks.getUser.mockResolvedValue({ data: { user: { id: friend } }, error: null })
    const publicProfile = { id: owner, nickname: "Collector", bio: "", avatar: null, sharedStyle: null, relationship: "friends" }
    const friendsWish = { id: "61000000-0000-4000-8000-000000000006", name: "friends wish", description: null, thumbnail: null, expectedPrice: 1, visibleTarget: null }
    mocks.rpc
      .mockResolvedValueOnce({ data: { ok: true, data: { ownerId: owner } }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, data: { revision: "0", viewerCategory: "friend", profile: publicProfile } }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, data: { revision: "0", viewerCategory: "friend", rows: [{ item: friendsWish, key: { value: "2026-01-01T00:00:00.000Z", id: friendsWish.id } }] } }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, data: { ownerId: owner } }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, data: { revision: "0", viewerCategory: "friend", profile: publicProfile } }, error: null })
    const result = await loadTokenWishlistPage(token)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.viewer).toEqual({ kind: "authenticated", userId: friend })
    expect(result.page.entries.map(item => item.name)).toContain("friends wish")
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_token: token, p_viewer_id: friend })
    expect(mocks.rpc.mock.calls[2][1]).toMatchObject({ p_owner_id: owner, p_viewer_id: friend, p_surface: "wishlist" })
  })

  it("denies a blocked signed-in visitor on the token page without guest fallback", async () => {
    mocks.cookies.mockResolvedValue({ getAll: () => [{ name: "sb-project-auth-token", value: "ok" }] })
    mocks.getUser.mockResolvedValue({ data: { user: { id: blocked } }, error: null })
    mocks.rpc.mockResolvedValue({ data: { ok: false, error: { code: "not_found", status: 404 } }, error: null })
    expect(await loadTokenWishlistPage(token)).toEqual({ ok: false })
    expect(mocks.rpc.mock.calls[0]).toEqual(["sharing_resolve_wishlist_token", { p_token: token, p_viewer_id: blocked }])
    expect(mocks.rpc.mock.calls.every(call => call[1].p_viewer_id !== null)).toBe(true)
  })

  it("404s the public profile page when public reads are disabled without touching the service", async () => {
    vi.stubEnv("SOCIAL_PUBLIC_READS_ENABLED", "false")
    expect(await loadPublicProfilePage(owner)).toEqual({ ok: false, reason: "disabled" })
    expect(mocks.service).not.toHaveBeenCalled()
  })

  it("rejects a non-uuid profile id before constructing a core", async () => {
    expect(await loadPublicProfilePage("not-a-uuid")).toEqual({ ok: false, reason: "not_found" })
    expect(mocks.service).not.toHaveBeenCalled()
  })

  it("loads a guest profile in-process and keeps owner editor fields out of the payload", async () => {
    const publicProfile = { id: owner, nickname: "Collector", bio: "Hi", avatar: null, sharedStyle: null, relationship: "none" }
    mocks.rpc.mockResolvedValueOnce({ data: { ok: true, data: { revision: "0", viewerCategory: "guest", profile: publicProfile } }, error: null })
    const result = await loadPublicProfilePage(owner)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.viewer).toEqual({ kind: "guest" })
    expect(result.viewerName).toBeNull()
    expect(result.profile.nickname).toBe("Collector")
    expect(result.profile.bio).toBe("Hi")
    expect(JSON.stringify(result)).not.toMatch(/email|wishlist_share_token|acquisition_price/)
    expect(mocks.rpc.mock.calls[0][0]).toBe("sharing_read_context")
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_owner_id: owner, p_viewer_id: null })
  })

  it("labels navigation with the signed-in viewer, not the profile owner", async () => {
    mocks.cookies.mockResolvedValue({ getAll: () => [{ name: "sb-project-auth-token", value: "ok" }] })
    mocks.getUser.mockResolvedValue({ data: { user: { id: friend } }, error: null })
    const publicProfile = { id: owner, nickname: "Collector", bio: "", avatar: null, sharedStyle: null, relationship: "friends" }
    mocks.rpc.mockResolvedValueOnce({ data: { ok: true, data: { revision: "0", viewerCategory: "friend", profile: publicProfile } }, error: null })
    const result = await loadPublicProfilePage(owner)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.viewer).toEqual({ kind: "authenticated", userId: friend })
    expect(result.viewerName).toBe("Friend")
    expect(result.profile.nickname).toBe("Collector")
    expect(result.viewerName).not.toBe(result.profile.nickname)
  })

  it("denies a blocked signed-in visitor on the profile page", async () => {
    mocks.cookies.mockResolvedValue({ getAll: () => [{ name: "sb-project-auth-token", value: "ok" }] })
    mocks.getUser.mockResolvedValue({ data: { user: { id: blocked } }, error: null })
    mocks.rpc.mockResolvedValue({ data: { ok: false, error: { code: "not_found", status: 404 } }, error: null })
    expect(await loadPublicProfilePage(owner)).toEqual({ ok: false, reason: "not_found" })
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_owner_id: owner, p_viewer_id: blocked })
  })
})
