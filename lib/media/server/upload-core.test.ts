import { describe, expect, it, vi } from "vitest"
import { completeOwnedUpload, discardOwnedUpload, prepareOwnedUpload } from "./upload-core"

const owner = "82000000-0000-4000-8000-000000000002"
const assetId = "82000000-0000-4000-8000-000000000003"

describe("prepareOwnedUpload", () => {
  it("registers a pending asset and returns a server-chosen signed target", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: true, data: { assetId, state: "pending", bucket: "item-photos", objectPath: `${owner}/items/x.jpg` } },
      error: null,
    })
    const storage = {
      createSignedUploadUrl: vi.fn().mockResolvedValue({
        signedUrl: "https://signed.example.test/upload",
        token: "tok",
        path: `${owner}/items/x.jpg`,
      }),
      objectExists: vi.fn(),
    }
    const result = await prepareOwnedUpload(rpc, storage, owner, "photo", "image/jpeg", 12)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.assetId).toBe(assetId)
    expect(result.data.objectPath.startsWith(`${owner}/items/`)).toBe(true)
    expect(storage.createSignedUploadUrl).toHaveBeenCalledWith("item-photos", result.data.objectPath)
    expect(rpc.mock.calls[0][0]).toBe("media_register_asset")
    expect(rpc.mock.calls[0][1].p_object_path).not.toContain("..")
  })

  it("rejects oversized or unknown mime types before RPC", async () => {
    const rpc = vi.fn()
    const storage = { createSignedUploadUrl: vi.fn(), objectExists: vi.fn() }
    const result = await prepareOwnedUpload(rpc, storage, owner, "photo", "application/pdf", 12)
    expect(result).toEqual({ ok: false, error: { code: "invalid_input", status: 400 } })
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe("completeOwnedUpload", () => {
  it("finalizes only after the object exists", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: { ok: true, data: { assetId, bucket: "item-photos", objectPath: `${owner}/items/a.jpg`, state: "pending" } },
        error: null,
      })
      .mockResolvedValueOnce({ data: { ok: true, data: { assetId, state: "ready" } }, error: null })
    const storage = {
      createSignedUploadUrl: vi.fn(),
      objectExists: vi.fn().mockResolvedValue(true),
    }
    const result = await completeOwnedUpload(rpc, storage, owner, "photo", assetId)
    expect(result).toEqual({ ok: true, data: { assetId, objectPath: `${owner}/items/a.jpg`, state: "ready" } })
    expect(storage.objectExists).toHaveBeenCalledWith("item-photos", `${owner}/items/a.jpg`)
    expect(rpc.mock.calls[1][0]).toBe("media_finalize_upload")
  })

  it("discards and fails when the blob is missing", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: { ok: true, data: { assetId, bucket: "item-photos", objectPath: `${owner}/items/a.jpg`, state: "pending" } },
        error: null,
      })
      .mockResolvedValue({ data: { ok: true, data: { assetId, discarded: true } }, error: null })
    const storage = { createSignedUploadUrl: vi.fn(), objectExists: vi.fn().mockResolvedValue(false) }
    const result = await completeOwnedUpload(rpc, storage, owner, "photo", assetId)
    expect(result).toEqual({ ok: false, error: { code: "invalid_input", status: 400 } })
    expect(rpc.mock.calls[1][0]).toBe("media_discard_upload")
    expect(rpc.mock.calls.some((call) => call[0] === "media_finalize_upload")).toBe(false)
  })
})

describe("discardOwnedUpload", () => {
  it("enqueues an unreferenced owner asset", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true, data: { assetId, discarded: true } }, error: null })
    expect(await discardOwnedUpload(rpc, owner, assetId)).toEqual({ ok: true, data: { assetId } })
  })
})
