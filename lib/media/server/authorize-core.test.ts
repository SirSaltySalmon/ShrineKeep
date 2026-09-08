import { describe, expect, it, vi } from "vitest"
import { createMediaAuthorizeCore } from "./authorize-core"

const photo = "81000000-0000-4000-8000-000000000001"
const owner = "81000000-0000-4000-8000-000000000002"
const secretUrl = "https://signed.example.test/item-photos/object?token=signed-object"

describe("media authorize adapter", () => {
  it("returns a bounded signed URL and never forwards SQL storage fields", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: true, data: { kind: "uploaded", referenceId: photo, bucket: "item-photos", objectPath: `${owner}/items/a.jpg`, mime: "image/jpeg", externalUrl: null, storage_path: "PRIVATE" } },
      error: null,
    })
    const sign = vi.fn().mockResolvedValue({ url: secretUrl })
    const result = await createMediaAuthorizeCore(rpc, sign)("photo", photo, { kind: "guest" })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.url).toBe(secretUrl)
    expect(result.data.referenceId).toBe(photo)
    expect(result.data.expiresAt).toEqual(expect.any(String))
    expect(JSON.stringify(result)).not.toContain("PRIVATE")
    expect(JSON.stringify(result)).not.toContain("storage_path")
    expect(sign).toHaveBeenCalledWith("item-photos", `${owner}/items/a.jpg`, 60)
    expect(rpc.mock.calls[0][1].p_viewer_id).toBeNull()
  })

  it("returns external HTTPS links without expiry or signing", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: true, data: { kind: "external", referenceId: photo, bucket: null, objectPath: null, mime: null, externalUrl: "https://cdn.example.test/a.png" } },
      error: null,
    })
    const sign = vi.fn()
    const result = await createMediaAuthorizeCore(rpc, sign)("photo", photo, { kind: "guest" })
    expect(result).toEqual({ ok: true, data: { referenceId: photo, url: "https://cdn.example.test/a.png", expiresAt: null } })
    expect(sign).not.toHaveBeenCalled()
  })

  it("does not downgrade a denied signed-in viewer to guest", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: false, error: { code: "not_found", status: 404, reason: "block" } }, error: null })
    const result = await createMediaAuthorizeCore(rpc, vi.fn())("photo", photo, { kind: "authenticated", userId: owner })
    expect(result).toEqual({ ok: false, error: { code: "not_found", status: 404 } })
    expect(rpc.mock.calls[0][1].p_viewer_id).toBe(owner)
  })

  it("rejects javascript and non-https external URLs from the backend", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: true, data: { kind: "external", referenceId: photo, bucket: null, objectPath: null, mime: null, externalUrl: "javascript:alert(1)" } },
      error: null,
    })
    expect(await createMediaAuthorizeCore(rpc, vi.fn())("photo", photo, { kind: "guest" })).toEqual({
      ok: false, error: { code: "not_found", status: 404 },
    })
  })

  it("rejects path traversal and unknown buckets before signing", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: true, data: { kind: "uploaded", referenceId: photo, bucket: "item-photos", objectPath: `${owner}/../other.jpg`, mime: "image/jpeg", externalUrl: null } },
      error: null,
    })
    const sign = vi.fn()
    expect(await createMediaAuthorizeCore(rpc, sign)("photo", photo, { kind: "guest" })).toEqual({
      ok: false, error: { code: "not_found", status: 404 },
    })
    expect(sign).not.toHaveBeenCalled()
  })

  it("uses the owner RPC and actor id for dashboard delivery", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: true, data: { kind: "uploaded", referenceId: photo, bucket: "item-photos", objectPath: `${owner}/items/a.jpg`, mime: "image/jpeg", externalUrl: null } },
      error: null,
    })
    const sign = vi.fn().mockResolvedValue({ url: secretUrl })
    const result = await createMediaAuthorizeCore(rpc, sign, "media_authorize_owner_reference")(
      "photo",
      photo,
      { kind: "authenticated", userId: owner },
    )
    expect(result.ok).toBe(true)
    expect(rpc.mock.calls[0][0]).toBe("media_authorize_owner_reference")
    expect(rpc.mock.calls[0][1]).toEqual({ p_kind: "photo", p_reference_id: photo, p_actor_id: owner })
  })

  it("does not run the owner RPC as a guest", async () => {
    const rpc = vi.fn()
    const result = await createMediaAuthorizeCore(rpc, vi.fn(), "media_authorize_owner_reference")("photo", photo, { kind: "guest" })
    expect(result).toEqual({ ok: false, error: { code: "authentication_required", status: 401 } })
    expect(rpc).not.toHaveBeenCalled()
  })
})
