import type { NextRequest } from "next/server"
import { cancelUserProSubscription } from "@/lib/moderation/cancel-user-subscription"
import { deleteUserStorage } from "@/lib/moderation/delete-user-storage"
import { requireModerator } from "@/lib/moderation/moderator-session"
import {
  moderationJsonResponse,
  moderationOptionsResponse,
} from "@/lib/moderation/request-auth"
import { sendBanEmail } from "@/lib/moderation/send-ban-email"
import { createSupabaseServiceClient } from "@/lib/supabase/service"

export const runtime = "nodejs"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function OPTIONS(request: NextRequest) {
  return moderationOptionsResponse(request)
}

/**
 * POST /api/moderation/ban-user
 * Requires signed-in user whose email is on MODERATOR_EMAILS (session verified server-side).
 * Cancels Pro in Stripe, sends ban email, purges storage, deletes Auth user (DB cascades).
 *
 * Body: { "user_id": "<uuid>" }
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

  const email = authData.user.email?.trim()
  if (!email) {
    return moderationJsonResponse(
      request,
      {
        error: "User has no email address; cannot send ban notice or proceed safely.",
      },
      400
    )
  }

  let includeSubscriptionCancelledNotice = false
  try {
    const subResult = await cancelUserProSubscription(supabase, userId)
    includeSubscriptionCancelledNotice = subResult.includeSubscriptionCancelledNotice
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe cancellation failed"
    console.error("[moderation/ban-user] Stripe step failed:", message, err)
    return moderationJsonResponse(request, { error: message }, 502)
  }

  try {
    await sendBanEmail({
      to: email,
      includeSubscriptionCancelledNotice,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send ban email"
    console.error("[moderation/ban-user] Email step failed:", message, err)
    return moderationJsonResponse(request, { error: message }, 502)
  }

  let itemPhotosDeleted = 0
  let avatarsDeleted = 0
  try {
    const counts = await deleteUserStorage(supabase, userId)
    itemPhotosDeleted = counts.itemPhotosDeleted
    avatarsDeleted = counts.avatarsDeleted
  } catch (err) {
    const message = err instanceof Error ? err.message : "Storage purge failed"
    console.error("[moderation/ban-user] Storage step failed:", message, err)
    return moderationJsonResponse(
      request,
      {
        error: message,
        partial: {
          stripe_subscription_addressed: true,
          email_sent: true,
        },
      },
      500
    )
  }

  const { error: deleteError } = await supabase.auth.admin.deleteUser(userId)

  if (deleteError) {
    const message = deleteError.message || "Failed to delete user"
    console.error("[moderation/ban-user] deleteUser failed:", message, deleteError)
    return moderationJsonResponse(
      request,
      {
        error: message,
        partial: {
          stripe_subscription_addressed: true,
          email_sent: true,
          item_photos_deleted: itemPhotosDeleted,
          avatars_deleted: avatarsDeleted,
        },
      },
      500
    )
  }

  return moderationJsonResponse(request, {
    ok: true,
    email_sent: true,
    include_subscription_cancelled_notice: includeSubscriptionCancelledNotice,
    deleted_storage: {
      item_photos: itemPhotosDeleted,
      avatars: avatarsDeleted,
    },
  }, 200)
}
