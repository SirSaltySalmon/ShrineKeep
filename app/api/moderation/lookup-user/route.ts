import type { NextRequest } from "next/server"
import { createSupabaseServiceClient } from "@/lib/supabase/service"
import {
  authorizeModeration,
  getModerationSecret,
  moderationJsonResponse,
  moderationOptionsResponse,
} from "@/lib/moderation/request-auth"

export const runtime = "nodejs"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function OPTIONS(request: NextRequest) {
  return moderationOptionsResponse(request)
}

/**
 * POST /api/moderation/lookup-user
 * Same auth as ban-user. Returns auth + profile fields for operator verification.
 */
export async function POST(request: NextRequest) {
  if (!getModerationSecret()) {
    return moderationJsonResponse(
      request,
      { error: "Moderation is not configured (MODERATION_SECRET missing)." },
      503
    )
  }

  if (!authorizeModeration(request)) {
    return moderationJsonResponse(request, { error: "Unauthorized" }, 401)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return moderationJsonResponse(request, { error: "Invalid JSON body" }, 400)
  }

  const userId =
    body && typeof body === "object" && "user_id" in body
      ? (body as { user_id: unknown }).user_id
      : undefined

  if (typeof userId !== "string" || !UUID_RE.test(userId)) {
    return moderationJsonResponse(request, { error: "user_id must be a valid UUID" }, 400)
  }

  const supabase = createSupabaseServiceClient()

  const { data: authData, error: authLookupError } = await supabase.auth.admin.getUserById(userId)

  if (authLookupError || !authData?.user) {
    return moderationJsonResponse(request, { error: "User not found" }, 404)
  }

  const authUser = authData.user

  const { data: profile } = await supabase
    .from("users")
    .select("username, name, created_at")
    .eq("id", userId)
    .maybeSingle()

  const { data: subRow } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id, status")
    .eq("user_id", userId)
    .maybeSingle()

  return moderationJsonResponse(
    request,
    {
      user: {
        id: authUser.id,
        email: authUser.email ?? null,
        email_confirmed_at: authUser.email_confirmed_at ?? null,
        created_at: authUser.created_at,
        last_sign_in_at: authUser.last_sign_in_at ?? null,
        username: profile?.username ?? null,
        display_name: profile?.name ?? null,
        profile_created_at: profile?.created_at ?? null,
        has_pro_subscription_record: Boolean(subRow?.stripe_subscription_id),
        subscription_status: subRow?.status ?? null,
      },
    },
    200
  )
}
