import type { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { classifyAuthUser } from "@/lib/judge/sandbox"
import { redirectWithCookies } from "@/lib/judge/session-response"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const kind = await classifyAuthUser(supabase, user)

  if (kind !== "expired") {
    return Response.redirect(new URL("/judge", request.url))
  }

  const { response, supabase: cookieClient } = redirectWithCookies(request, "/judge?expired=1")
  await cookieClient.auth.signOut()
  return response
}
