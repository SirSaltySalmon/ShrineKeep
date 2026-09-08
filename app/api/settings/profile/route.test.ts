import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { GET, PUT } from "./route"

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), service: vi.fn(), token: vi.fn() }))
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [] }) }))
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser } }) }))
vi.mock("@/lib/supabase/service", () => ({ createSupabaseServiceClient: mocks.service }))
vi.mock("@/lib/settings", () => ({ generateShareToken: mocks.token }))
const actor = "91000000-0000-4000-8000-000000000001"
const body = {
  nickname: "Shown",
  bio: "plain",
  profileShareStyle: false,
  root: { collectionVisibility: "private", shareFinancials: false, wishlistVisibility: "public" },
  wishlistLinkEnabled: true,
  wishlistShareToken: null,
  expectedRevision: "1",
}
function request(value: unknown = body, origin = "http://localhost") {
  return new NextRequest("http://localhost/api/settings/profile", {
    method: "PUT",
    headers: { "content-type": "application/json", authorization: "Bearer verified", origin },
    body: JSON.stringify(value),
  })
}

describe("owner profile settings route", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv("SOCIAL_SHARING_EDITS_ENABLED", "true")
    mocks.getUser.mockResolvedValue({ data: { user: { id: actor } }, error: null })
    mocks.service.mockReturnValue({ rpc: mocks.rpc })
    mocks.token.mockReturnValue("generated-token-value")
    mocks.rpc.mockResolvedValue({ error: null, data: { ok: true, data: { revision: "2", wishlistShareToken: "generated-token-value", wishlistGuestVisibleCount: 2, wishlistGuestTotalCount: 2 } } })
  })
  afterEach(() => vi.unstubAllEnvs())

  it("takes actor from the session and does not derive a public nickname", async () => {
    const result = await PUT(request({ ...body, actorId: "forged", nickname: null }))
    expect(result.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith("sharing_update_owner_settings", expect.objectContaining({
      p_actor_id: actor,
      p_nickname: null,
      p_bio: "plain",
      p_root_wishlist_visibility: "public",
      p_wishlist_link_enabled: true,
      p_wishlist_share_token: "generated-token-value",
    }))
  })

  it("rejects overlong bios and unknown audiences without writing", async () => {
    expect((await PUT(request({ ...body, bio: "x".repeat(501) }))).status).toBe(400)
    expect((await PUT(request({ ...body, root: { ...body.root, collectionVisibility: "everyone" } }))).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("defaults disabled before auth", async () => {
    vi.stubEnv("SOCIAL_SHARING_EDITS_ENABLED", "false")
    expect((await PUT(request())).status).toBe(404)
    expect(mocks.getUser).not.toHaveBeenCalled()
  })

  it("reads the owner snapshot without a client-supplied actor", async () => {
    mocks.rpc.mockResolvedValue({
      error: null,
      data: {
        ok: true,
        data: {
          revision: "1",
          nickname: null,
          bio: "",
          profileShareStyle: false,
          wishlistLinkEnabled: false,
          wishlistShareToken: null,
          root: body.root,
          wishlistGuestVisibleCount: 0,
          wishlistGuestTotalCount: 2,
        },
      },
    })
    const result = await GET(new NextRequest("http://localhost/api/settings/profile", { headers: { authorization: "Bearer verified" } }))
    expect(result.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith("sharing_read_owner_settings", { p_actor_id: actor })
    expect(await result.json()).toMatchObject({ nickname: null, wishlistGuestTotalCount: 2 })
  })
})
