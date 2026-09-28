import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { POST as send, GET as incoming } from "@/app/api/social/requests/route"
import { POST as accept } from "@/app/api/social/requests/[requestId]/accept/route"
import { POST as decline } from "@/app/api/social/requests/[requestId]/decline/route"
import { DELETE as cancel } from "@/app/api/social/requests/[requestId]/route"
import { DELETE as unfriend } from "@/app/api/social/friends/[userId]/route"
import { GET as friends } from "@/app/api/social/friends/route"
import { POST as block, GET as blocks } from "@/app/api/social/blocks/route"
import { DELETE as unblock } from "@/app/api/social/blocks/[userId]/route"
import { PATCH as markRead } from "@/app/api/social/notifications/read/route"

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), service: vi.fn(), cookies: vi.fn() }))
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: mocks.cookies }) }))
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser } }) }))
vi.mock("@/lib/supabase/service", () => ({ createSupabaseServiceClient: mocks.service }))
const actor = "e1000000-0000-4000-8000-000000000001"
const target = "e1000000-0000-4000-8000-000000000002"
const requestId = "e2000000-0000-4000-8000-000000000001"
const ctx = { params: Promise.resolve({ requestId }) }
const targetCtx = { params: Promise.resolve({ userId: target }) }
function request(body: unknown = { targetUserId: target, idempotencyKey: requestId }, headers: Record<string,string> = {}, method = "POST") {
  return new NextRequest("http://localhost/api/social/requests", { method,
    headers: { authorization: "Bearer verified", "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}
describe("social mutation routes", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv("SOCIAL_MUTATIONS_ENABLED", "true")
    mocks.cookies.mockReturnValue([])
    mocks.getUser.mockResolvedValue({ data: { user: { id: actor } }, error: null })
    mocks.service.mockReturnValue({ rpc: mocks.rpc })
    mocks.rpc.mockResolvedValue({ data: { ok: true, data: { revision: "1" } }, error: null })
  })
  afterEach(() => vi.unstubAllEnvs())
  it("defaults off before touching auth or service credentials", async () => {
    vi.stubEnv("SOCIAL_MUTATIONS_ENABLED", undefined)
    expect((await send(request())).status).toBe(404)
    expect(mocks.getUser).not.toHaveBeenCalled()
    expect(mocks.service).not.toHaveBeenCalled()
  })
  it("derives sender from verified auth and uses durable send RPC", async () => {
    const response = await send(request({ targetUserId: target, idempotencyKey: requestId, actorId: target }))
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith("social_send_request", { actor_id: actor, target_id: target, idempotency_key: requestId })
    expect(await response.json()).toEqual({ success: true, revision: "1", invalidated: ["requests", "notifications"] })
    expect(response.headers.get("cache-control")).toContain("no-store")
    expect(response.headers.get("vary")).toContain("Authorization")
  })
  it.each([[accept,"accept"], [decline,"decline"], [cancel,"cancel"]] as const)("uses path request and bigint version for action %#", async (route, operation) => {
    const response = await route(request({ targetUserId: target, requestId: "forged", version: "9007199254740993" }), ctx)
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith("social_mutate", {
      actor_id: actor, target_id: target, operation, expected_request_id: requestId, expected_version: "9007199254740993",
    })
  })
  it.each([[unfriend,"unfriend"], [unblock,"unblock"]] as const)("uses target path for deletion %#", async (route, operation) => {
    const response = await route(request({ targetUserId: actor }, {}, "DELETE"), targetCtx)
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith("social_mutate", {
      actor_id: actor, target_id: target, operation, expected_request_id: null, expected_version: null,
    })
  })
  it("dispatches blocking with no forged actor or operation", async () => {
    expect((await block(request({ targetUserId: target, actorId: target, operation: "unblock" }))).status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith("social_mutate", expect.objectContaining({ actor_id: actor, operation: "block" }))
  })
  it("rejects guests and invalid credentials without privileged access", async () => {
    expect((await send(request({}, { authorization: "" }))).status).toBe(401)
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: "expired" } })
    expect((await send(request())).status).toBe(401)
    mocks.cookies.mockReturnValue([{ name: "sb-project-auth-token.0", value: "expired" }])
    expect((await send(request({}, { authorization: "" }))).status).toBe(401)
    expect(mocks.service).not.toHaveBeenCalled()
  })
  it("rejects cross-origin writes, bad content types, oversized and malformed payloads", async () => {
    expect((await send(request({}, { origin: "https://evil.invalid" }))).status).toBe(403)
    expect((await send(request({}, { "sec-fetch-site": "cross-site" }))).status).toBe(403)
    expect((await send(request({}, { "content-type": "text/plain" }))).status).toBe(400)
    expect((await send(request({ padding: "x".repeat(5000) }))).status).toBe(400)
    for (const value of [null, {}, [], { targetUserId: target }]) expect((await send(request(value))).status).toBe(400)
    expect(mocks.service).not.toHaveBeenCalled()
  })
  it("returns bounded error fields and Retry-After", async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: false, error: { code: "rate_limited", retryAfterSeconds: 23, secret: "hidden" } } })
    const response = await send(request())
    expect(response.status).toBe(429)
    expect(response.headers.get("retry-after")).toBe("23")
    expect(await response.json()).toEqual({ error: { code: "rate_limited", status: 429, retryAfterSeconds: 23 } })
  })
  it("hides raw RPC failures", async () => {
    mocks.rpc.mockRejectedValue(new Error("secret database details"))
    const response = await send(request())
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain("secret")
  })
})

describe("social list routes", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv("SOCIAL_MUTATIONS_ENABLED", "true")
    vi.stubEnv("SHARING_CURSOR_SECRET", "test-only-secret-longer-than-thirty-two-bytes")
    mocks.cookies.mockReturnValue([])
    mocks.getUser.mockResolvedValue({ data: { user: { id: actor } }, error: null })
    mocks.service.mockReturnValue({ rpc: mocks.rpc })
    mocks.rpc.mockResolvedValue({ data: { ok: true, data: { revision: "0", viewerCategory: "owner", rows: [] } }, error: null })
  })
  afterEach(() => vi.unstubAllEnvs())
  it("defaults list and mark-read off before auth", async () => {
    vi.stubEnv("SOCIAL_MUTATIONS_ENABLED", undefined)
    expect((await friends(new NextRequest("http://localhost/api/social/friends"))).status).toBe(404)
    expect((await markRead(request({ allVisible: true }, {}, "PATCH"))).status).toBe(404)
    expect(mocks.getUser).not.toHaveBeenCalled()
    expect(mocks.service).not.toHaveBeenCalled()
  })
  it("requires a verified session and ignores actor query spoofing", async () => {
    expect((await friends(new NextRequest("http://localhost/api/social/friends"))).status).toBe(401)
    const response = await friends(new NextRequest(`http://localhost/api/social/friends?actorId=${target}&query=Ada`, {
      headers: { authorization: "Bearer verified" },
    }))
    expect(response.status).toBe(200)
    expect(mocks.rpc.mock.calls[0][0]).toBe("social_read_page")
    expect(mocks.rpc.mock.calls[0][1]).toEqual(expect.objectContaining({ p_actor_id: actor, p_surface: "friends", p_query: "Ada" }))
    expect(response.headers.get("cache-control")).toContain("no-store")
  })
  it("requires request direction and rejects cross-surface query params", async () => {
    expect((await incoming(new NextRequest("http://localhost/api/social/requests", { headers: { authorization: "Bearer verified" } }))).status).toBe(400)
    expect((await incoming(new NextRequest("http://localhost/api/social/requests?direction=incoming&query=x", { headers: { authorization: "Bearer verified" } }))).status).toBe(400)
    expect(mocks.service).not.toHaveBeenCalled()
  })
  it("returns no-store block rows without fetching service when cursor secret is missing", async () => {
    vi.stubEnv("SHARING_CURSOR_SECRET", "")
    const response = await blocks(new NextRequest("http://localhost/api/social/blocks", { headers: { authorization: "Bearer verified" } }))
    expect(response.status).toBe(503)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it("marks visible history from the verified actor and rejects cross-origin writes", async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: true, data: { revision: "9" } }, error: null })
    expect((await markRead(request({ allVisible: true }, { origin: "https://evil.invalid" }, "PATCH"))).status).toBe(403)
    const response = await markRead(request({ allVisible: true }, {}, "PATCH"))
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith("social_mark_read", { p_actor_id: actor, p_notification_ids: null, p_all_visible: true })
    expect(await response.json()).toEqual({ success: true, revision: "9", invalidated: ["notifications"] })
  })
})
