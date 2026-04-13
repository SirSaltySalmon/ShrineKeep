import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { startRouteSpan } from "@/lib/monitoring/sentry"
import { deleteBoxesForUser, type DeleteBoxesRequestBody } from "@/lib/services/boxes/delete-boxes"

/**
 * Delete one or more boxes. Body: { boxId, mode } or { boxes: { boxId, mode }[] }.
 * Uses optimized batch deletion when multiple boxes provided.
 */
export async function POST(request: NextRequest) {
  return startRouteSpan(
    "boxes.delete",
    "http.server",
    { "feature.area": "boxes", "feature.operation": "delete" },
    async () => {
      try {
        const supabase = await createSupabaseServerClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const body = (await request.json()) as DeleteBoxesRequestBody
        const { deletedCount } = await deleteBoxesForUser(supabase, user.id, body)
        return NextResponse.json({ success: true, deletedCount })
      } catch (error: unknown) {
        if (
          error instanceof Error &&
          (error.message === "boxId and mode, or boxes array, required" ||
            error.message === "Invalid mode" ||
            error.message === "All boxes must have the same delete mode in batch operations")
        ) {
          return NextResponse.json({ error: error.message }, { status: 400 })
        }
        const message = error instanceof Error ? error.message : "Failed to delete box"
        return NextResponse.json({ error: message }, { status: 500 })
      }
    }
  )
}
