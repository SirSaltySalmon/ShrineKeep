import { describe, expect, it, vi } from "vitest"
import { createPublicReadCore } from "./read-core"

const owner = "e1000000-0000-4000-8000-000000000001"
const boxId = "e2000000-0000-4000-8000-000000000001"
const secret = "test-only-secret-at-least-thirty-two-bytes"
const response = (data: unknown) => ({ data: { ok: true, data }, error: null })
const stats = {
  currentValue: 10, totalAcquisition: 10, bucket: "day" as const,
  valueHistory: [{ date: "2024-01-01", value: 0 }],
  acquisitionHistory: [{ date: "2024-01-01", cumulativeAcquisition: 10 }],
  revision: "9", viewerCategory: "guest", itemIds: ["SECRET"],
}

describe("public stats boundaries", () => {
  it("reconstructs bounded series and strips internal fields", async () => {
    const rpc = vi.fn().mockResolvedValue(response(stats))
    const result = await createPublicReadCore(rpc, secret).stats(owner, { kind: "guest" }, { boxId, fromDate: "2024-01-01", toDate: "2024-01-03" })
    expect(result).toEqual({ ok: true, data: {
      currentValue: 10, totalAcquisition: 10, bucket: "day",
      valueHistory: [{ date: "2024-01-01", value: 0 }],
      acquisitionHistory: [{ date: "2024-01-01", cumulativeAcquisition: 10 }],
    } })
    expect(JSON.stringify(result)).not.toMatch(/SECRET|revision|viewerCategory|itemIds/)
    expect(rpc.mock.calls).toEqual([["sharing_read_stats", {
      p_owner_id: owner, p_viewer_id: null, p_box_id: boxId, p_from: "2024-01-01", p_to: "2024-01-03",
    }]])
  })
  it("rejects malformed dates and inverted windows before privileged reads", async () => {
    const rpc = vi.fn()
    const core = createPublicReadCore(rpc, secret)
    expect(await core.stats(owner, { kind: "guest" }, { fromDate: "2024-13-40" }))
      .toEqual({ ok: false, error: { code: "invalid_input", status: 400 } })
    expect(await core.stats(owner, { kind: "guest" }, { fromDate: "2024-01-02", toDate: "2024-01-01" }))
      .toEqual({ ok: false, error: { code: "invalid_input", status: 400 } })
    expect(await core.stats("not-uuid", { kind: "guest" }, {}))
      .toEqual({ ok: false, error: { code: "invalid_input", status: 400 } })
    expect(rpc).not.toHaveBeenCalled()
  })
  it("does not downgrade blocked viewers to guest", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: false, error: { code: "not_found", status: 404, reason: "block" } }, error: null })
    expect(await createPublicReadCore(rpc, secret).stats(owner, { kind: "authenticated", userId: owner }, {}))
      .toEqual({ ok: false, error: { code: "not_found", status: 404 } })
    expect(rpc.mock.calls[0][1].p_viewer_id).toBe(owner)
  })
  it.each([
    { ...stats, currentValue: Number.POSITIVE_INFINITY },
    { ...stats, valueHistory: Array.from({ length: 367 }, (_, n) => ({ date: "2024-01-01", value: n })) },
    { ...stats, bucket: "week" },
    { ...stats, valueHistory: [{ date: "2024-01-32", value: 1 }] },
  ])("rejects malformed backend stats", async data => {
    const rpc = vi.fn().mockResolvedValue(response(data))
    expect(await createPublicReadCore(rpc, secret).stats(owner, { kind: "guest" }, {}))
      .toEqual({ ok: false, error: { code: "temporarily_unavailable", status: 503 } })
  })
})
