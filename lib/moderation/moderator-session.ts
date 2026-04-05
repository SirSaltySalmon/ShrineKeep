import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { isAllowedModeratorEmail, moderatorsConfigured } from "@/lib/moderation/moderators"
import { moderationJsonResponse } from "@/lib/moderation/request-auth"

export type ModeratorAuthResult =
  | { ok: true; email: string }
  | { ok: false; response: NextResponse }

/**
 * Confirms the request has a valid Supabase session whose email is on MODERATOR_EMAILS.
 * Email comes from the verified JWT (getUser), not from client-supplied headers.
 */
export async function requireModerator(request: NextRequest): Promise<ModeratorAuthResult> {
  if (!moderatorsConfigured()) {
    return {
      ok: false,
      response: moderationJsonResponse(
        request,
        { error: "Moderation is not configured (MODERATOR_EMAILS missing or empty)." },
        503
      ),
    }
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return {
      ok: false,
      response: moderationJsonResponse(request, { error: "Unauthorized" }, 401),
    }
  }

  const email = user.email
  if (!isAllowedModeratorEmail(email)) {
    return {
      ok: false,
      response: moderationJsonResponse(request, { error: "Unauthorized" }, 403),
    }
  }

  return { ok: true, email: email! }
}
