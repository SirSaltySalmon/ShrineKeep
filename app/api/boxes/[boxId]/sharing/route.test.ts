import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { GET, PUT } from "./route"

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), service: vi.fn() }))
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [] }) }))
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser } }) }))
vi.mock("@/lib/supabase/service", () => ({ createSupabaseServiceClient: mocks.service }))
const actor = "81000000-0000-4000-8000-000000000001"
const boxId = "82000000-0000-4000-8000-000000000001"
const context = { params: Promise.resolve({ boxId }) }
const body = { collectionVisibility: "private", shareFinancials: false, wishlistVisibility: "public", applyToDescendants: true, expectedRevision: "9007199254740993", expectedDescendantCount: 2 }
function request(value: unknown = body, origin = "http://localhost") {
  return new NextRequest(`http://localhost/api/boxes/${boxId}/sharing`, { method: "PUT", headers: { "content-type": "application/json", authorization: "Bearer verified", origin }, body: JSON.stringify(value) })
}

describe("owner sharing route", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv("SOCIAL_SHARING_EDITS_ENABLED", "true")
    mocks.getUser.mockResolvedValue({ data: { user: { id: actor } }, error: null })
    mocks.service.mockReturnValue({ rpc: mocks.rpc })
    mocks.rpc.mockResolvedValue({ error: null, data: { ok: true, data: { revision: "9007199254740994" } } })
  })
  afterEach(() => vi.unstubAllEnvs())
  it("requires authentication for preview", async () => {
    expect((await GET(new NextRequest(`http://localhost/api/boxes/${boxId}/sharing`), context)).status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("takes actor from verified session and box from route, preserving bigint revision", async () => {
    const result = await PUT(request({ ...body, actorId: "forged", boxId: "forged" }), context)
    expect(result.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith("sharing_update_box", { p_actor_id: actor, p_box_id: boxId, p_collection_visibility: "private", p_share_financials: false, p_wishlist_visibility: "public", p_apply_descendants: true, p_expected_revision: "9007199254740993", p_expected_descendant_count: 2 })
    expect(result.headers.get("cache-control")).toContain("no-store")
  })
  it("rejects missing, malformed or overflowing editor fields without mutation", async () => {
    for (const value of [null, {}, { ...body, applyToDescendants: "true" }, { ...body, expectedRevision: "9223372036854775808" }, { ...body, expectedDescendantCount: -1 }, { ...body, wishlistVisibility: "everyone" }]) {
      expect((await PUT(request(value), context)).status).toBe(400)
    }
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("rejects cross-origin and oversized writes", async () => {
    expect((await PUT(request(body, "https://untrusted.invalid"), context)).status).toBe(403)
    expect((await PUT(request({ ...body, extra: "x".repeat(5000) }), context)).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("returns revision conflicts without raw database details", async () => {
    mocks.rpc.mockResolvedValue({ error: null, data: { ok: false, error: { code: "revision_conflict", status: 409, privateRows: "SECRET" } } })
    const result = await PUT(request(), context)
    expect(result.status).toBe(409)
    expect(await result.text()).not.toContain("SECRET")
  })
  it("defaults disabled before auth and writes", async () => {
    vi.stubEnv("SOCIAL_SHARING_EDITS_ENABLED", "false")
    expect((await PUT(request(), context)).status).toBe(404)
    expect(mocks.getUser).not.toHaveBeenCalled()
    expect(mocks.service).not.toHaveBeenCalled()
  })
})
