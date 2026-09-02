import { NextResponse } from "next/server"
import type { User } from "@supabase/supabase-js"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { assertSandboxNotExpired } from "@/lib/judge/sandbox"

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

export async function requireMutableUser(): Promise<
  | { ok: true; supabase: Supabase; user: User }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }
  }
  const expired = await assertSandboxNotExpired(supabase, user.id)
  if (!expired.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: expired.error }, { status: expired.status }),
    }
  }
  return { ok: true, supabase, user }
}
