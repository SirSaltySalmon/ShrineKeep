import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { startRouteSpan } from "@/lib/monitoring/sentry"
import { moveItemsForUser, type MoveItemsRequestBody } from "@/lib/services/items/move-items"

/**
 * Move one or more items to a target box.
 * Body: { itemId: string, targetBoxId: string | null } or { itemIds: string[], targetBoxId: string | null }.
 * Uses optimized batch movement for multiple items.
 */
export async function POST(request: NextRequest) {
  return startRouteSpan(
    "items.move",
    "http.server",
    { "feature.area": "items", "feature.operation": "move" },
    async () => {
      try {
        const supabase = await createSupabaseServerClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const body = (await request.json()) as MoveItemsRequestBody
        const { movedCount } = await moveItemsForUser(supabase, user.id, body)
        return NextResponse.json({ success: true, movedCount })
      } catch (error: unknown) {
        if (
          error instanceof Error &&
          error.message === "itemId or itemIds array is required"
        ) {
          return NextResponse.json({ error: error.message }, { status: 400 })
        }
        const message =
          error instanceof Error ? error.message : "Failed to move item"
        return NextResponse.json({ error: message }, { status: 500 })
      }
    }
  )
}
