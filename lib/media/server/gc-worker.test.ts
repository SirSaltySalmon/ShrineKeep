import { describe, expect, it, vi } from "vitest"
import { mediaGcWorkerResponse, runMediaGc } from "./gc-worker"

const id = "81000000-0000-4000-8000-000000000001"
const token = "81000000-0000-4000-8000-000000000002"
const asset = { id, claimToken: token, bucket: "item-photos", objectPath: `${id}/items/a.jpg` }
function dependencies(assets: unknown[] = [asset]) {
  return {
    rpc: vi.fn().mockResolvedValueOnce({ data: { ok: true, data: { assets } }, error: null })
      .mockResolvedValue({ data: { ok: true }, error: null }),
    remove: vi.fn().mockResolvedValue({ error: null }),
  }
}

describe("durable media GC consumer", () => {
  it("deletes through Storage before fenced completion", async () => {
    const deps = dependencies()
    expect(await runMediaGc(deps)).toEqual({ claimed: 1, deleted: 1, retry: 0, deferred: 0 })
    expect(deps.rpc).toHaveBeenNthCalledWith(1, "media_claim_gc", { p_limit: 4 }, expect.any(AbortSignal))
    expect(deps.remove).toHaveBeenCalledWith("item-photos", asset.objectPath, expect.any(AbortSignal))
    expect(deps.rpc).toHaveBeenNthCalledWith(2, "media_complete_gc", { p_asset_id: id, p_claim_token: token, p_success: true }, expect.any(AbortSignal))
    expect(deps.remove.mock.invocationCallOrder[0]).toBeLessThan(deps.rpc.mock.invocationCallOrder[1])
  })
  it("records retry without marking deleted when Storage fails", async () => {
    const deps = dependencies()
    deps.remove.mockRejectedValue(new Error("sensitive storage path"))
    expect(await runMediaGc(deps)).toEqual({ claimed: 1, deleted: 0, retry: 1, deferred: 0 })
    expect(deps.rpc.mock.calls[1][1]).toEqual({ p_asset_id: id, p_claim_token: token, p_success: false })
  })
  it("leaves uncertain completion recoverable by lease expiry", async () => {
    const deps = dependencies()
    deps.rpc.mockResolvedValue({ data: null, error: "db down" })
    expect(await runMediaGc(deps)).toEqual({ claimed: 1, deleted: 0, retry: 0, deferred: 1 })
  })
  it("does not start deletion after the invocation deadline", async () => {
    const deps = dependencies()
    const controller = new AbortController()
    controller.abort()
    expect((await runMediaGc(deps, controller.signal)).deferred).toBe(1)
    expect(deps.remove).not.toHaveBeenCalled()
    expect(deps.rpc).toHaveBeenCalledTimes(1)
  })
  it.each([
    [{ ...asset, bucket: "other" }],
    [{ ...asset, objectPath: `${id}/../other` }],
    [{ ...asset, claimToken: "invalid" }],
    [asset, asset, asset, asset, asset],
  ])("rejects malformed or oversized claims before any deletion", async (...assets) => {
    const deps = dependencies(assets)
    await expect(runMediaGc(deps)).rejects.toThrow("invalid_claim")
    expect(deps.remove).not.toHaveBeenCalled()
  })
  it("caps concurrent deletion at the four-asset claim batch", async () => {
    const deps = dependencies([asset, asset, asset, asset])
    let active = 0
    let peak = 0
    deps.remove.mockImplementation(async () => {
      active++
      peak = Math.max(peak, active)
      await new Promise(resolve => setTimeout(resolve, 5))
      active--
      return { error: null }
    })
    expect((await runMediaGc(deps)).deleted).toBe(4)
    expect(peak).toBe(4)
  })
})

describe("worker invocation boundary", () => {
  const secret = "s".repeat(32)
  it("rejects missing configuration, bad secrets and browser methods before constructing privileged clients", async () => {
    const create = vi.fn()
    expect((await mediaGcWorkerResponse(new Request("https://worker.test", { method: "POST" }), undefined, create)).status).toBe(503)
    expect((await mediaGcWorkerResponse(new Request("https://worker.test", { method: "POST", headers: { Authorization: "Bearer public-key" } }), secret, create)).status).toBe(401)
    expect((await mediaGcWorkerResponse(new Request("https://worker.test"), secret, create)).status).toBe(405)
    expect(create).not.toHaveBeenCalled()
  })
  it("returns aggregate counts without paths or claim tokens", async () => {
    const response = await mediaGcWorkerResponse(new Request("https://worker.test", { method: "POST", headers: { Authorization: `Bearer ${secret}` } }), secret, () => dependencies())
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toEqual({ claimed: 1, deleted: 1, retry: 0, deferred: 0 })
  })
})
