import type { NextRequest } from "next/server"
import { deleteUserStorage } from "@/lib/moderation/delete-user-storage"
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
 * POST /api/moderation/delete-storage
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
    const counts = await deleteUserStorage(supabase, userId)
    return moderationJsonResponse(
      request,
      {
        ok: true,
        deleted_storage: {
          item_photos: counts.itemPhotosDeleted,
          avatars: counts.avatarsDeleted,
        },
      },
      200
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : "Storage purge failed"
    console.error("[moderation/delete-storage] failed:", message, err)
    captureRouteException(err, {
      area: "moderation",
      route: "/api/moderation/delete-storage",
      userId: mod.user.id,
      tags: {
        operation: "delete_storage",
      },
      extra: {
        target_user_id: userId,
      },
    })
    return moderationJsonResponse(request, { error: message }, 500)
  }
}
