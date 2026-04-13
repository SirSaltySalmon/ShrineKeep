import type { NextRequest } from "next/server"
import { cancelUserProSubscription } from "@/lib/moderation/cancel-user-subscription"
import { requireModerator } from "@/lib/moderation/moderator-session"
import {
  moderationJsonResponse,
  moderationOptionsResponse,
} from "@/lib/moderation/request-auth"
import { captureRouteException } from "@/lib/monitoring/sentry"
import { createSupabaseServiceClient } from "@/lib/supabase/service"

export const runtime = "nodejs"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function OPTIONS(request: NextRequest) {
  return moderationOptionsResponse(request)
}

/**
 * POST /api/moderation/cancel-subscription
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

  try {
    const result = await cancelUserProSubscription(supabase, userId)
    return moderationJsonResponse(
      request,
      {
        ok: true,
        include_subscription_cancelled_notice: result.includeSubscriptionCancelledNotice,
        subscription_cancelled: result.subscriptionCancelled,
      },
      200
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe cancellation failed"
    console.error("[moderation/cancel-subscription] failed:", message, err)
    captureRouteException(err, {
      area: "moderation",
      route: "/api/moderation/cancel-subscription",
      userId: mod.user.id,
      tags: {
        operation: "cancel_subscription",
      },
      extra: {
        target_user_id: userId,
      },
    })
    return moderationJsonResponse(request, { error: message }, 502)
  }
}
