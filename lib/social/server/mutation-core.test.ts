import { describe, expect, it, vi } from "vitest"
import { createSocialMarkRead, createSocialMutationCore, parseMarkRead, parseSocialMutation } from "./mutation-core"
const actor = "d1000000-0000-4000-8000-000000000001"
const target = "d1000000-0000-4000-8000-000000000002"
const key = "d2000000-0000-4000-8000-000000000001"

describe("social mutation core", () => {
  it("requires a durable key for sending and positive bigint version for actions", () => {
    expect(parseSocialMutation("send_request", { targetUserId: target })).toBeNull()
    for (const version of [0, "0", "-1", 1, "9223372036854775808", null]) {
      expect(parseSocialMutation("accept", { targetUserId: target, version }, key)).toBeNull()
    }
    expect(parseSocialMutation("accept", { targetUserId: target, version: "9007199254740993", requestId: "forged" }, key))
      .toEqual({ operation: "accept", targetId: target, version: "9007199254740993", requestId: key })
  })
  it("routes sends through the receipt RPC with explicit trusted actor", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true, data: { revision: "1" } }, error: null })
    expect(await createSocialMutationCore(rpc)(actor, { operation: "send_request", targetId: target, idempotencyKey: key }))
      .toEqual({ ok: true, data: { revision: "1", invalidated: ["requests", "notifications"] } })
    expect(rpc).toHaveBeenCalledWith("social_send_request", { actor_id: actor, target_id: target, idempotency_key: key })
  })
  it("rejects self mutations without calling SQL", async () => {
    const rpc = vi.fn()
    expect((await createSocialMutationCore(rpc)(actor, { operation: "block", targetId: actor.toUpperCase() })).ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })
  it.each(["stale_request", "idempotency_conflict"])("allowlists %s errors", async code => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: false, error: { code, status: 200, secret: "hidden" } } })
    expect(await createSocialMutationCore(rpc)(actor, { operation: "block", targetId: target }))
      .toEqual({ ok: false, error: { code, status: 409 } })
  })
  it.each([
    { ok: true, data: { secret: "hidden" } },
    { ok: false, error: { code: "rate_limited", retryAfterSeconds: -1 } },
    { ok: false, error: { code: "unexpected", secret: "hidden" } },
    { error: { code: "not_found" } },
  ])("fails closed on malformed RPC responses", async data => {
    const rpc = vi.fn().mockResolvedValue({ data })
    expect(await createSocialMutationCore(rpc)(actor, { operation: "block", targetId: target }))
      .toEqual({ ok: false, error: { code: "temporarily_unavailable", status: 503 } })
  })
  it("rejects oversized mark-read payloads and extra fields", () => {
    expect(parseMarkRead({ allVisible: true, notificationIds: [key] })).toBeNull()
    expect(parseMarkRead({ notificationIds: [] })).toBeNull()
    expect(parseMarkRead({ notificationIds: Array.from({ length: 101 }, () => key) })).toBeNull()
    expect(parseMarkRead({ allVisible: true })).toEqual({ notificationIds: null, allVisible: true })
    expect(parseMarkRead({ notificationIds: [key] })).toEqual({ notificationIds: [key], allVisible: false })
  })
  it("marks owned notifications through the service actor argument", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true, data: { revision: "4" } }, error: null })
    expect(await createSocialMarkRead(rpc)(actor, { notificationIds: [key], allVisible: false }))
      .toEqual({ ok: true, data: { revision: "4", invalidated: ["notifications"] } })
    expect(rpc).toHaveBeenCalledWith("social_mark_read", { p_actor_id: actor, p_notification_ids: [key], p_all_visible: false })
  })
})
