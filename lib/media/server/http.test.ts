import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { publicMediaResponse, ownerMediaResponse } from "./http"
import { GET } from "@/app/api/public/media/[kind]/[referenceId]/route"
import { GET as ownerGET } from "@/app/api/media/[kind]/[referenceId]/route"

const mocks = vi.hoisted(() => ({ cookies: vi.fn(), getUser: vi.fn(), rpc: vi.fn(), signed: vi.fn(), service: vi.fn() }))
vi.mock("next/headers", () => ({ cookies: mocks.cookies }))
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser } }) }))
vi.mock("@/lib/supabase/service", () => ({ createSupabaseServiceClient: mocks.service }))
const photo = "82000000-0000-4000-8000-000000000001"
const owner = "82000000-0000-4000-8000-000000000002"

describe("public media HTTP boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv("SOCIAL_PUBLIC_READS_ENABLED", "true")
    mocks.cookies.mockResolvedValue({ getAll: () => [] })
    mocks.service.mockReturnValue({
      rpc: mocks.rpc,
      storage: { from: () => ({ createSignedUrl: mocks.signed }) },
    })
  })
  afterEach(() => vi.unstubAllEnvs())

  it("defaults feature off without touching auth or storage", async () => {
    vi.stubEnv("SOCIAL_PUBLIC_READS_ENABLED", "false")
    const result = await publicMediaResponse(new NextRequest("http://localhost/api/public/media/photo/" + photo), "photo", photo)
    expect(result.status).toBe(404)
    expect(mocks.service).not.toHaveBeenCalled()
    expect(mocks.getUser).not.toHaveBeenCalled()
  })

  it("rejects unknown kinds before privileged calls", async () => {
    const result = await publicMediaResponse(new NextRequest("http://localhost/api/public/media/file/" + photo), "file", photo)
    expect(result.status).toBe(400)
    expect(mocks.service).not.toHaveBeenCalled()
  })

  it("sets private no-store headers and signs through the service client", async () => {
    mocks.rpc.mockResolvedValue({
      data: { ok: true, data: { kind: "uploaded", referenceId: photo, bucket: "item-photos", objectPath: `${owner}/items/a.jpg`, mime: "image/jpeg", externalUrl: null } },
      error: null,
    })
    mocks.signed.mockResolvedValue({ data: { signedUrl: "https://signed.example.test/a" }, error: null })
    const result = await GET(new NextRequest("http://localhost/api/public/media/photo/" + photo), { params: Promise.resolve({ kind: "photo", referenceId: photo }) })
    expect(result.status).toBe(200)
    expect(result.headers.get("cache-control")).toContain("no-store")
    expect(result.headers.get("vary")).toBe("Cookie, Authorization")
    expect(mocks.rpc.mock.calls[0][1].p_viewer_id).toBeNull()
    expect(mocks.signed).toHaveBeenCalledWith(`${owner}/items/a.jpg`, 60)
  })

  it("treats expired auth cookies as guests on public media", async () => {
    mocks.cookies.mockResolvedValue({ getAll: () => [{ name: "sb-project-auth-token.0", value: "expired" }] })
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error("expired") })
    mocks.rpc.mockResolvedValue({
      data: { ok: true, data: { kind: "uploaded", referenceId: photo, bucket: "item-photos", objectPath: `${owner}/items/a.jpg`, mime: "image/jpeg", externalUrl: null } },
      error: null,
    })
    mocks.signed.mockResolvedValue({ data: { signedUrl: "https://signed.example.test/a" }, error: null })
    const result = await publicMediaResponse(new NextRequest("http://localhost/api/public/media/photo/" + photo), "photo", photo)
    expect(result.status).toBe(200)
    expect(mocks.rpc.mock.calls[0][1].p_viewer_id).toBeNull()
  })

  it("returns generic unavailable errors without leaking infrastructure failures", async () => {
    mocks.service.mockImplementation(() => { throw new Error("PRIVATE storage secret") })
    const result = await publicMediaResponse(new NextRequest("http://localhost/api/public/media/photo/" + photo), "photo", photo)
    expect(result.status).toBe(503)
    expect(await result.text()).not.toContain("PRIVATE")
  })
})

describe("owner media HTTP boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv("SOCIAL_PUBLIC_READS_ENABLED", "false")
    mocks.cookies.mockResolvedValue({ getAll: () => [{ name: "sb-project-auth-token", value: "ok" }] })
    mocks.getUser.mockResolvedValue({ data: { user: { id: owner } }, error: null })
    mocks.service.mockReturnValue({
      rpc: mocks.rpc,
      storage: { from: () => ({ createSignedUrl: mocks.signed }) },
    })
    mocks.rpc.mockResolvedValue({ data: { ok: true }, error: null })
  })
  afterEach(() => vi.unstubAllEnvs())

  it("stays available when public reads are disabled", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: { ok: true }, error: null })
      .mockResolvedValueOnce({
        data: { ok: true, data: { kind: "uploaded", referenceId: photo, bucket: "item-photos", objectPath: `${owner}/items/a.jpg`, mime: "image/jpeg", externalUrl: null } },
        error: null,
      })
    mocks.signed.mockResolvedValue({ data: { signedUrl: "https://signed.example.test/a" }, error: null })
    const result = await ownerGET(new NextRequest("http://localhost/api/media/photo/" + photo), {
      params: Promise.resolve({ kind: "photo", referenceId: photo }),
    })
    expect(result.status).toBe(200)
    expect(mocks.rpc.mock.calls[0][0]).toBe("media_register_legacy_photo_for_owner")
    expect(mocks.rpc.mock.calls[1][0]).toBe("media_authorize_owner_reference")
    expect(mocks.rpc.mock.calls[1][1].p_actor_id).toBe(owner)
  })

  it("rejects guests without touching storage", async () => {
    mocks.cookies.mockResolvedValue({ getAll: () => [] })
    const result = await ownerMediaResponse(new NextRequest("http://localhost/api/media/photo/" + photo), "photo", photo)
    expect(result.status).toBe(401)
    expect(mocks.service).not.toHaveBeenCalled()
  })

  it("redirects image requests only after owner authorization, without caching", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { ok: true }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, data: {
        kind: "external", referenceId: photo, externalUrl: "https://images.example.test/photo.jpg",
      } }, error: null })
    const result = await ownerMediaResponse(new NextRequest(`http://localhost/api/media/photo/${photo}?image=1`), "photo", photo)
    expect(result.status).toBe(307)
    expect(result.headers.get("location")).toBe("https://images.example.test/photo.jpg")
    expect(result.headers.get("cache-control")).toContain("no-store")
    expect(mocks.rpc.mock.calls[1][1].p_actor_id).toBe(owner)
  })

  it("never redirects a denied image request", async () => {
    mocks.rpc.mockResolvedValue({ data: { ok: false, error: { code: "not_found" } }, error: null })
    const result = await ownerMediaResponse(new NextRequest(`http://localhost/api/media/photo/${photo}?image=1`), "photo", photo)
    expect(result.status).toBe(404)
    expect(result.headers.get("location")).toBeNull()
    expect(mocks.signed).not.toHaveBeenCalled()
  })
})
