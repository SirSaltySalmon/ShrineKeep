import type { User } from "@supabase/supabase-js"
import type { createSupabaseServerClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase/service"

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

export const SANDBOX_TTL_MS = 24 * 60 * 60 * 1000

export type SandboxKind = "user" | "sandbox" | "expired" | "missing"

export interface SandboxRow {
  is_sandbox: boolean
  sandbox_expires_at: string | null
}

export function isSandboxExpired(row: SandboxRow, now = Date.now()): boolean {
  if (!row.is_sandbox) return false
  if (!row.sandbox_expires_at) return true
  return Date.parse(row.sandbox_expires_at) <= now
}

export async function loadSandboxRow(
  supabase: Supabase,
  userId: string
): Promise<SandboxRow | null> {
  const { data, error } = await supabase
    .from("users")
    .select("is_sandbox, sandbox_expires_at")
    .eq("id", userId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    is_sandbox: Boolean(data.is_sandbox),
    sandbox_expires_at: data.sandbox_expires_at ?? null,
  }
}

export async function classifyAuthUser(
  supabase: Supabase,
  user: User | null
): Promise<SandboxKind> {
  if (!user) return "missing"
  const row = await loadSandboxRow(supabase, user.id)
  if (!row) return "missing"
  if (!row.is_sandbox) return "user"
  if (isSandboxExpired(row)) return "expired"
  return "sandbox"
}

export async function assertNotSandbox(
  supabase: Supabase,
  userId: string
): Promise<{ ok: true } | { ok: false; status: 403; error: string }> {
  const row = await loadSandboxRow(supabase, userId)
  if (row?.is_sandbox) {
    return { ok: false, status: 403, error: "Not available on a temporary sandbox account." }
  }
  return { ok: true }
}

export async function assertSandboxNotExpired(
  supabase: Supabase,
  userId: string
): Promise<{ ok: true } | { ok: false; status: 401; error: string }> {
  const row = await loadSandboxRow(supabase, userId)
  if (row && isSandboxExpired(row)) {
    return { ok: false, status: 401, error: "Sandbox expired." }
  }
  return { ok: true }
}

export async function enqueueThenDeleteAuthUser(userId: string): Promise<void> {
  const service = createSupabaseServiceClient()
  const { error: queueError } = await service.from("sandbox_purge_queue").upsert({
    user_id: userId,
  })
  if (queueError) throw queueError
  const { error: deleteError } = await service.auth.admin.deleteUser(userId)
  if (deleteError) throw deleteError
}

export async function deleteOneExpiredSandboxAuthUser(): Promise<string | null> {
  const service = createSupabaseServiceClient()
  const { data, error } = await service
    .from("users")
    .select("id")
    .eq("is_sandbox", true)
    .lt("sandbox_expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data?.id) return null
  await enqueueThenDeleteAuthUser(data.id)
  return data.id
}

export function sandboxExpiresAt(from = Date.now()): string {
  return new Date(from + SANDBOX_TTL_MS).toISOString()
}

export function newSandboxIdentity() {
  const id = crypto.randomUUID()
  const token = id.replace(/-/g, "")
  return {
    email: `sandbox.${token}@shrinekeep.invalid`,
    username: `sandbox_${token.slice(0, 12)}`,
    name: "Judge",
    password: `${token}${crypto.randomUUID().replace(/-/g, "")}`,
  }
}
