import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { countCollectionItemsInBoxSubtrees } from "@/lib/api/copy-expand"

/**
 * Count collection items in one or more box subtrees (is_wishlist = false only).
 * Wishlist rows linked via wishlist_target_box_id are excluded — they do not use the free-tier collection cap.
 * Body: { rootIds: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = (await request.json()) as { rootIds?: string[] }
    const rootIds = body.rootIds ?? []
    if (rootIds.length === 0) {
      return NextResponse.json({ error: "rootIds array is required" }, { status: 400 })
    }

    const itemCount = await countCollectionItemsInBoxSubtrees(supabase, user.id, rootIds)
    return NextResponse.json({ itemCount })
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to count subtree items"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
