import type { NextRequest } from "next/server"
import { requireModerator } from "@/lib/moderation/moderator-session"
import {
  moderationJsonResponse,
  moderationOptionsResponse,
} from "@/lib/moderation/request-auth"
import { createSupabaseServiceClient } from "@/lib/supabase/service"

export const runtime = "nodejs"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const USER_PAGE_SIZE = 200
const USER_MAX_PAGES = 250

export async function OPTIONS(request: NextRequest) {
  return moderationOptionsResponse(request)
}

async function findAuthUserByEmail(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  email: string
) {
  const normalized = email.trim().toLowerCase()

  for (let page = 1; page <= USER_MAX_PAGES; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: USER_PAGE_SIZE,
    })

    if (error) {
      throw new Error(`auth users lookup failed: ${error.message}`)
    }

    const users = data?.users ?? []
    const match = users.find((candidate) => candidate.email?.trim().toLowerCase() === normalized)
    if (match) {
      return match
    }

    if (users.length < USER_PAGE_SIZE) {
      return null
    }
  }

  throw new Error("auth users lookup exceeded scan limit")
}

/**
 * POST /api/moderation/lookup-user
 * Requires signed-in user whose email is on MODERATOR_EMAILS. Returns auth + profile for verification.
 */
export async function POST(request: NextRequest) {
  const mod = await requireModerator(request)
  if (!mod.ok) {
    return mod.response
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return moderationJsonResponse(request, { error: "Invalid JSON body" }, 400)
  }

  const lookupInput =
    body && typeof body === "object" && "lookup" in body
      ? (body as { lookup: unknown }).lookup
      : body && typeof body === "object" && "user_id" in body
        ? (body as { user_id: unknown }).user_id
        : undefined

  if (typeof lookupInput !== "string" || !lookupInput.trim()) {
    return moderationJsonResponse(request, { error: "lookup must be a non-empty string" }, 400)
  }

  const lookup = lookupInput.trim()
  const supabase = createSupabaseServiceClient()
  let authUser = null

  try {
    if (UUID_RE.test(lookup)) {
      const { data, error } = await supabase.auth.admin.getUserById(lookup)
      if (error) {
        return moderationJsonResponse(request, { error: "User not found" }, 404)
      }
      authUser = data?.user ?? null
    } else if (EMAIL_RE.test(lookup)) {
      authUser = await findAuthUserByEmail(supabase, lookup)
    } else {
      return moderationJsonResponse(
        request,
        { error: "lookup must be a valid user UUID or email" },
        400
      )
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lookup failed"
    return moderationJsonResponse(request, { error: message }, 500)
  }

  if (!authUser) {
    return moderationJsonResponse(request, { error: "User not found" }, 404)
  }

  const userId = authUser.id

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
