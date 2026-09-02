import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createSupabaseServiceClient } from "@/lib/supabase/service"
import {
  enqueueThenDeleteAuthUser,
  newSandboxIdentity,
  sandboxExpiresAt,
} from "@/lib/judge/sandbox"
import { supabaseOnResponse } from "@/lib/judge/session-response"

export async function mintSandboxSession(request: NextRequest, captchaToken: string) {
  const identity = newSandboxIdentity()
  const service = createSupabaseServiceClient()
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email: identity.email,
    password: identity.password,
    email_confirm: true,
    user_metadata: { username: identity.username, name: identity.name },
    app_metadata: { sandbox: true },
  })
  if (createError || !created.user) {
    throw new Error(createError?.message ?? "createUser failed")
  }
  const userId = created.user.id
  const { error: flagError } = await service
    .from("users")
    .update({
      is_sandbox: true,
      sandbox_expires_at: sandboxExpiresAt(),
    })
    .eq("id", userId)
  if (flagError) {
    await service.auth.admin.deleteUser(userId)
    throw flagError
  }

  const json = NextResponse.json({ ok: true, resumed: false })
  const cookieClient = supabaseOnResponse(request, json)
  const { error: signInError } = await cookieClient.auth.signInWithPassword({
    email: identity.email,
    password: identity.password,
    options: { captchaToken },
  })
  if (signInError) {
    await enqueueThenDeleteAuthUser(userId)
    throw signInError
  }
  return json
}
