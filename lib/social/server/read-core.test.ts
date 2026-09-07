import { describe, expect, it, vi } from "vitest"
import { createSocialReadCore } from "./read-core"

const actor = "c1000000-0000-4000-8000-000000000001"
const friend = "c1000000-0000-4000-8000-000000000002"
const secret = "test-only-cursor-signing-secret-at-least-32-bytes"
const acceptedAt = "2026-01-01T00:00:00.123456+00:00"
const row = (n: number, extra: Record<string, unknown> = {}) => ({
  key: { value: acceptedAt, id: `c1000000-0000-4000-8000-${String(n).padStart(12, "0")}` },
  item: { profile: { id: `c1000000-0000-4000-8000-${String(n).padStart(12, "0")}`, nickname: `Friend ${n}`, avatar: null, email: "PRIVATE" }, acceptedAt, ...extra },
})
const response = (data: unknown) => ({ data: { ok: true, data }, error: null })

describe("social read adapter boundaries", () => {
  it("strips extra identity fields and signs the 20th key", async () => {
    const rpc = vi.fn().mockResolvedValue(response({ revision: "0", viewerCategory: "owner", rows: Array.from({ length: 21 }, (_, i) => row(i + 2)) }))
    const result = await createSocialReadCore(rpc, secret).friends(actor, {})
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.entries).toHaveLength(20)
    expect(result.data.hasMore).toBe(true)
    expect(JSON.stringify(result.data.entries)).not.toMatch(/PRIVATE|email|"key"/)
    expect(result.data.entries[0].profile.avatar).toBeNull()
    rpc.mockResolvedValue(response({ revision: "0", viewerCategory: "owner", rows: [] }))
    await createSocialReadCore(rpc, secret).friends(actor, { cursor: result.data.nextCursor! })
    expect(rpc.mock.calls[2][1].p_after_key).toEqual(row(21).key)
    expect(rpc.mock.calls[2][1].p_expected_revision).toBe("0")
    expect(rpc.mock.calls[0][1].p_actor_id).toBe(actor)
  })
  it("keeps block rows identity-free and fails closed on nickname leakage", async () => {
    const rpc = vi.fn().mockResolvedValue(response({ revision: "0", viewerCategory: "owner", rows: [{ key: { value: acceptedAt, id: friend }, item: { userId: friend, createdAt: acceptedAt, nickname: "HIDDEN" } }] }))
    expect(await createSocialReadCore(rpc, secret).blocks(actor, {})).toEqual({ ok: false, error: { code: "temporarily_unavailable", status: 503 } })
    rpc.mockResolvedValue(response({ revision: "0", viewerCategory: "owner", rows: [{ key: { value: acceptedAt, id: friend }, item: { userId: friend, createdAt: acceptedAt } }] }))
    const result = await createSocialReadCore(rpc, secret).blocks(actor, {})
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.entries).toEqual([{ userId: friend, createdAt: acceptedAt }])
    expect(JSON.stringify(result.data)).not.toMatch(/nickname|profile/)
  })
  it("rejects overlong search before privileged calls and binds request direction", async () => {
    const rpc = vi.fn()
    expect(await createSocialReadCore(rpc, secret).friends(actor, { query: "x".repeat(65) })).toEqual({ ok: false, error: { code: "invalid_input", status: 400 } })
    expect(rpc).not.toHaveBeenCalled()
    rpc.mockResolvedValue(response({ revision: "1", viewerCategory: "owner", rows: [] }))
    await createSocialReadCore(rpc, secret).requests(actor, { direction: "incoming" })
    expect(rpc.mock.calls[0][1]).toEqual(expect.objectContaining({ p_actor_id: actor, p_surface: "requests", p_direction: "incoming" }))
  })
  it("requires bounded unread fields only on notification pages", async () => {
    const note = { key: { value: acceptedAt, id: friend }, item: { id: friend, actor: { id: friend, nickname: "Ada", avatar: null }, kind: "request", createdAt: acceptedAt, readAt: null, actionableRequest: { requestId: friend, version: "1" } } }
    const rpc = vi.fn().mockResolvedValue(response({ revision: "0", viewerCategory: "owner", rows: [note] }))
    expect(await createSocialReadCore(rpc, secret).notifications(actor, {})).toEqual({ ok: false, error: { code: "temporarily_unavailable", status: 503 } })
    rpc.mockResolvedValue(response({ revision: "0", viewerCategory: "owner", rows: [note], unreadCount: 1, unreadCountCapped: false }))
    const result = await createSocialReadCore(rpc, secret).notifications(actor, {})
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.unreadCount).toBe(1)
    expect(result.data.entries[0].actionableRequest).toEqual({ requestId: friend, version: "1" })
  })
  it("validates actor identity before any privileged call", async () => {
    const rpc = vi.fn()
    expect(await createSocialReadCore(rpc, secret).friends("not-uuid", {})).toEqual({ ok: false, error: { code: "invalid_input", status: 400 } })
    expect(rpc).not.toHaveBeenCalled()
  })
})
