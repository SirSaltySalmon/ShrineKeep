import { vi } from "vitest"
import type * as SandboxModule from "@/lib/judge/sandbox"

type Sandbox = typeof SandboxModule

function usersMaybeSingle(
  supabase: unknown
): ((this: unknown) => Promise<{ data: SandboxModule.SandboxRow | null; error: unknown }>) | null {
  try {
    const from = (supabase as { from?: (table: string) => unknown }).from
    const select = (from?.("users") as { select?: (cols: string) => unknown } | undefined)?.select
    const eq = (
      select?.("is_sandbox, sandbox_expires_at") as
        | { eq?: (col: string, id: string) => unknown }
        | undefined
    )?.eq
    const maybeSingle = (eq?.("id", "probe") as { maybeSingle?: unknown } | undefined)?.maybeSingle
    return typeof maybeSingle === "function"
      ? (maybeSingle as (this: unknown) => Promise<{ data: SandboxModule.SandboxRow | null; error: unknown }>)
      : null
  } catch {
    return null
  }
}

vi.mock("@/lib/judge/sandbox", async (importOriginal) => {
  const actual = await importOriginal<Sandbox>()

  async function loadSandboxRow(
    supabase: Parameters<Sandbox["loadSandboxRow"]>[0],
    userId: string
  ) {
    if (!usersMaybeSingle(supabase)) {
      return { is_sandbox: false, sandbox_expires_at: null }
    }
    return actual.loadSandboxRow(supabase, userId)
  }

  return {
    ...actual,
    loadSandboxRow,
    async classifyAuthUser(supabase: Parameters<Sandbox["classifyAuthUser"]>[0], user: Parameters<Sandbox["classifyAuthUser"]>[1]) {
      if (!user) return "missing"
      const row = await loadSandboxRow(supabase, user.id)
      if (!row) return "missing"
      if (!row.is_sandbox) return "user"
      if (actual.isSandboxExpired(row)) return "expired"
      return "sandbox"
    },
    async assertNotSandbox(supabase: Parameters<Sandbox["assertNotSandbox"]>[0], userId: string) {
      const row = await loadSandboxRow(supabase, userId)
      if (row?.is_sandbox) {
        return { ok: false as const, status: 403 as const, error: "Not available on a temporary sandbox account." }
      }
      return { ok: true as const }
    },
    async assertSandboxNotExpired(
      supabase: Parameters<Sandbox["assertSandboxNotExpired"]>[0],
      userId: string
    ) {
      const row = await loadSandboxRow(supabase, userId)
      if (row && actual.isSandboxExpired(row)) {
        return { ok: false as const, status: 401 as const, error: "Sandbox expired." }
      }
      return { ok: true as const }
    },
  }
})
