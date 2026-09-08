import { describe, expect, it, vi } from "vitest"
import { createPublicReadCore } from "./read-core"
const owner = "a1000000-0000-4000-8000-000000000001"
const itemId = "a3000000-0000-4000-8000-000000000001"
const id = (n: number) => `a4000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const secret = "test-only-secret-at-least-thirty-two-bytes"
const context = { revision: "7", viewerCategory: "guest", profile: { id: owner, nickname: "Collector", bio: "", avatar: null, sharedStyle: null, relationship: "none" } }
const item = { id: itemId, name: "Item", description: null, thumbnail: null, thumbnailReferenceId: id(1), currentValue: null, acquisitionPrice: null, acquisitionDate: null, storage_path: "PRIVATE" }
const photos = Array.from({ length: 21 }, (_, n) => ({ referenceId: id(n + 1), key: { id: id(n + 1), value: "2026-01-01T00:00:00.123456Z" }, url: "PRIVATE" }))
const response = (data: unknown) => ({ data: { ok: true, data }, error: null })
const detail = { revision: "7", viewerCategory: "guest", item, photos }
const media = () => vi.fn(async (_kind, referenceId, _viewer) => ({ ok: true as const, data: { referenceId, url: `https://signed.test/${referenceId}`, expiresAt: "2026-09-08T00:01:00Z" } }))
function setup(data: unknown = detail) {
  const rpc = vi.fn().mockResolvedValueOnce(response(context)).mockResolvedValueOnce(response(data))
  const resolve = media()
  return { rpc, resolve, core: createPublicReadCore(rpc, secret, resolve) }
}

describe("public item detail boundaries", () => {
  it("projects bounded photos, signs references and strips internal fields", async () => {
    const { core, resolve } = setup()
    const result = await core.collectionItem(owner, { kind: "guest" }, itemId, {})
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.photos.entries).toHaveLength(20)
    expect(result.data).not.toHaveProperty("tags")
    expect(result.data.item.thumbnail?.referenceId).toBe(id(1))
    expect(JSON.stringify(result.data)).not.toMatch(/PRIVATE|thumbnailReferenceId|"key"|user_id/)
    expect(resolve.mock.calls.every(call => call[2].kind === "guest")).toBe(true)
    expect(resolve.mock.calls.some(call => call[1] === id(21))).toBe(false)
  })
  it("binds photo cursors to resource, item, viewer and surface", async () => {
    const { core, rpc } = setup()
    const first = await core.collectionItem(owner, { kind: "guest" }, itemId, {})
    if (!first.ok) throw new Error("fixture failed")
    for (const attempt of [
      () => core.collectionItem(owner, { kind: "guest" }, id(99), { photosCursor: first.data.photos.nextCursor! }),
      () => core.wishlistItem(owner, { kind: "guest" }, itemId, { photosCursor: first.data.photos.nextCursor! }),
      () => core.collectionItem(owner, { kind: "authenticated", userId: owner }, itemId, { photosCursor: first.data.photos.nextCursor! }),
    ]) {
      rpc.mockResolvedValueOnce(response(context))
      expect(await attempt()).toEqual({ ok: false, error: { code: "invalid_input", status: 400 } })
    }
    expect(rpc.mock.calls.filter(call => call[0] === "sharing_read_item_detail")).toHaveLength(1)
  })
  it("passes continuation keys without losing timestamp precision", async () => {
    const { core, rpc } = setup()
    const first = await core.collectionItem(owner, { kind: "guest" }, itemId, {})
    if (!first.ok) throw new Error("fixture failed")
    rpc.mockResolvedValueOnce(response(context)).mockResolvedValueOnce(response({ ...detail, photos: [] }))
    await core.collectionItem(owner, { kind: "guest" }, itemId, { photosCursor: first.data.photos.nextCursor! })
    expect(rpc.mock.calls[3][1].p_photos_after_key).toEqual(photos[19].key)
    expect(rpc.mock.calls[3][1]).not.toHaveProperty("p_tags_after_key")
  })
  it("rejects stale cursors before detail reads", async () => {
    const { core, rpc } = setup()
    const first = await core.collectionItem(owner, { kind: "guest" }, itemId, {})
    if (!first.ok) throw new Error("fixture failed")
    rpc.mockResolvedValueOnce(response({ ...context, revision: "8" }))
    expect(await core.collectionItem(owner, { kind: "guest" }, itemId, { photosCursor: first.data.photos.nextCursor! }))
      .toEqual({ ok: false, error: { code: "cursor_reset", status: 409 } })
    expect(rpc).toHaveBeenCalledTimes(3)
  })
  it.each([
    { ...detail, photos: [...photos, photos[0]] },
    { ...detail, tags: [{ name: "Tag 0", color: "blue" }] },
    { ...detail, photos: [{ ...photos[0], referenceId: id(99) }] },
    { ...detail, item: { ...item, id: id(99) } },
    { ...detail, revision: "8" },
  ])("rejects malformed backend details before signing", async data => {
    const { core, resolve } = setup(data)
    expect(await core.collectionItem(owner, { kind: "guest" }, itemId, {})).toEqual({ ok: false, error: { code: "temporarily_unavailable", status: 503 } })
    expect(resolve).not.toHaveBeenCalled()
  })
  it("omits newly unavailable media and fails infrastructure errors without raw URL fallback", async () => {
    const rpc = vi.fn().mockResolvedValueOnce(response(context)).mockResolvedValueOnce(response(detail))
    const missing = vi.fn().mockResolvedValue({ ok: false, error: { code: "not_found", status: 404 } })
    const first = await createPublicReadCore(rpc, secret, missing).collectionItem(owner, { kind: "guest" }, itemId, {})
    expect(first.ok && first.data.photos.entries).toEqual([])
    expect(first.ok && first.data.item.thumbnail).toBeNull()
    rpc.mockResolvedValueOnce(response(context)).mockResolvedValueOnce(response(detail))
    missing.mockResolvedValue({ ok: false, error: { code: "temporarily_unavailable", status: 503 } })
    expect(await createPublicReadCore(rpc, secret, missing).collectionItem(owner, { kind: "guest" }, itemId, {}))
      .toEqual({ ok: false, error: { code: "temporarily_unavailable", status: 503 } })
  })
  it("hydrates only visible list thumbnails", async () => {
    const { rpc, resolve, core } = setup({ revision: "7", viewerCategory: "guest", rows: Array.from({ length: 21 }, (_, n) => ({
      key: { id: id(n + 1), value: n }, item: { ...item, id: id(n + 1), thumbnailReferenceId: id(n + 1) },
    })) })
    const result = await core.collectionItems(owner, { kind: "guest" }, { boxId: itemId })
    expect(result.ok && result.data.entries[0].thumbnail?.referenceId).toBe(id(1))
    expect(resolve).toHaveBeenCalledTimes(20)
    expect(rpc).toHaveBeenCalledTimes(2)
  })
})
