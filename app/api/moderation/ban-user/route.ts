import { timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { cancelUserProSubscription } from "@/lib/moderation/cancel-user-subscription"
import { deleteUserStorage } from "@/lib/moderation/delete-user-storage"
import { sendBanEmail } from "@/lib/moderation/send-ban-email"
import { createSupabaseServiceClient } from "@/lib/supabase/service"

export const runtime = "nodejs"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function getModerationSecret(): string | null {
  const s = process.env.MODERATION_SECRET?.trim()
  return s && s.length > 0 ? s : null
}

function authorizeModeration(request: NextRequest): boolean {
  const expected = getModerationSecret()
  if (!expected) {
    return false
  }

  const authHeader = request.headers.get("authorization")
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7)
    if (token.length !== expected.length) {
      return false
    }
    try {
      return timingSafeEqual(Buffer.from(token, "utf8"), Buffer.from(expected, "utf8"))
    } catch {
      return false
    }
  }

  const headerSecret = request.headers.get("x-moderation-secret")
  if (headerSecret != null) {
    if (headerSecret.length !== expected.length) {
      return false
    }
    try {
      return timingSafeEqual(
        Buffer.from(headerSecret, "utf8"),
        Buffer.from(expected, "utf8")
      )
    } catch {
      return false
    }
  }

  return false
}

/**
 * POST /api/moderation/ban-user
 * Server-only. Cancels Pro in Stripe, sends ban email, purges storage, deletes Auth user (DB cascades).
 *
 * Headers: Authorization: Bearer <MODERATION_SECRET> or x-moderation-secret: <MODERATION_SECRET>
 * Body: { "user_id": "<uuid>" }
 */
export async function POST(request: NextRequest) {
  if (!getModerationSecret()) {
    return NextResponse.json(
      { error: "Moderation is not configured (MODERATION_SECRET missing)." },
      { status: 503 }
    )
  }

  if (!authorizeModeration(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const userId =
    body && typeof body === "object" && "user_id" in body
      ? (body as { user_id: unknown }).user_id
      : undefined

  if (typeof userId !== "string" || !UUID_RE.test(userId)) {
    return NextResponse.json({ error: "user_id must be a valid UUID" }, { status: 400 })
  }

  const supabase = createSupabaseServiceClient()

  const { data: authData, error: authLookupError } = await supabase.auth.admin.getUserById(userId)

  if (authLookupError || !authData?.user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  const email = authData.user.email?.trim()
  if (!email) {
    return NextResponse.json(
      { error: "User has no email address; cannot send ban notice or proceed safely." },
      { status: 400 }
    )
  }

  let includeSubscriptionCancelledNotice = false
  try {
    const subResult = await cancelUserProSubscription(supabase, userId)
    includeSubscriptionCancelledNotice = subResult.includeSubscriptionCancelledNotice
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe cancellation failed"
    console.error("[moderation/ban-user] Stripe step failed:", message, err)
    return NextResponse.json({ error: message }, { status: 502 })
  }

  try {
    await sendBanEmail({
      to: email,
      includeSubscriptionCancelledNotice,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send ban email"
    console.error("[moderation/ban-user] Email step failed:", message, err)
    return NextResponse.json({ error: message }, { status: 502 })
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
    return NextResponse.json(
      {
        error: message,
        partial: {
          stripe_subscription_addressed: true,
          email_sent: true,
        },
      },
      { status: 500 }
    )
  }

  const { error: deleteError } = await supabase.auth.admin.deleteUser(userId)

  if (deleteError) {
    const message = deleteError.message || "Failed to delete user"
    console.error("[moderation/ban-user] deleteUser failed:", message, deleteError)
    return NextResponse.json(
      {
        error: message,
        partial: {
          stripe_subscription_addressed: true,
          email_sent: true,
          item_photos_deleted: itemPhotosDeleted,
          avatars_deleted: avatarsDeleted,
        },
      },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok: true,
    email_sent: true,
    include_subscription_cancelled_notice: includeSubscriptionCancelledNotice,
    deleted_storage: {
      item_photos: itemPhotosDeleted,
      avatars: avatarsDeleted,
    },
  })
}
