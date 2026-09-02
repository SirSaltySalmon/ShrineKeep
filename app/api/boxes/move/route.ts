import { createSupabaseServerClient } from "@/lib/supabase/server"
import { requireMutableUser } from "@/lib/judge/require-mutable-user"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { startRouteSpan } from "@/lib/monitoring/sentry"
import { moveBoxesForUser, type MoveBoxesRequestBody } from "@/lib/services/boxes/move-boxes"

/**
 * Move one or more boxes to a target parent box.
 * Body: { boxId, targetParentBoxId } or { boxIds: string[], targetParentBoxId }.
 * Uses optimized batch movement for multiple boxes.
 */
export async function POST(request: NextRequest) {
  return startRouteSpan(
    "boxes.move",
    "http.server",
    { "feature.area": "boxes", "feature.operation": "move" },
    async () => {
      try {
        const session = await requireMutableUser()
        if (!session.ok) return session.response
        const { supabase, user } = session

        const body = (await request.json()) as MoveBoxesRequestBody
        const { movedCount } = await moveBoxesForUser(supabase, user.id, body)
        return NextResponse.json({ success: true, movedCount })
      } catch (error: unknown) {
        if (
          error instanceof Error &&
          error.message === "boxId or boxIds array is required"
        ) {
          return NextResponse.json({ error: error.message }, { status: 400 })
        }
        const message =
          error instanceof Error
            ? error.message
            : typeof error === "object" && error !== null && "message" in error
              ? String((error as { message: unknown }).message)
              : "Failed to move box"

        return NextResponse.json({ error: message }, { status: 500 })
      }
    }
  )
}
