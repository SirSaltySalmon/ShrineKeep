import { describe, expect, it, vi } from "vitest"
import { assertSandboxNotExpired, isSandboxExpired, loadSandboxRow } from "./sandbox"

describe("isSandboxExpired", () => {
  it("only expires sandbox rows past the timestamp", () => {
    expect(isSandboxExpired({ is_sandbox: false, sandbox_expires_at: "2000-01-01T00:00:00.000Z" })).toBe(false)
    expect(isSandboxExpired({ is_sandbox: true, sandbox_expires_at: null })).toBe(true)
    const now = Date.parse("2026-09-02T00:00:00.000Z")
    expect(
      isSandboxExpired({ is_sandbox: true, sandbox_expires_at: "2026-09-03T00:00:00.000Z" }, now)
    ).toBe(false)
    expect(
      isSandboxExpired({ is_sandbox: true, sandbox_expires_at: "2026-09-01T00:00:00.000Z" }, now)
    ).toBe(true)
  })
})

function usersClient(row: { is_sandbox: boolean; sandbox_expires_at: string | null } | null) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
        }),
      }),
    }),
  } as never
}

describe("loadSandboxRow", () => {
  it("maps a users row", async () => {
    await expect(
      loadSandboxRow(usersClient({ is_sandbox: true, sandbox_expires_at: "2099-01-01T00:00:00.000Z" }), "u1")
    ).resolves.toEqual({ is_sandbox: true, sandbox_expires_at: "2099-01-01T00:00:00.000Z" })
  })
})

describe("assertSandboxNotExpired", () => {
  it("401s an expired sandbox and allows a live user", async () => {
    await expect(
      assertSandboxNotExpired(
        usersClient({ is_sandbox: true, sandbox_expires_at: "2000-01-01T00:00:00.000Z" }),
        "u1"
      )
    ).resolves.toMatchObject({ ok: false, status: 401 })
    await expect(
      assertSandboxNotExpired(usersClient({ is_sandbox: false, sandbox_expires_at: null }), "u1")
    ).resolves.toEqual({ ok: true })
  })
})
