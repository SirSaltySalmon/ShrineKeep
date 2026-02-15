import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { moveItem } from "@/lib/api/move-item"

/**
 * Move one or more items to a target box.
 * Body: { itemId: string, targetBoxId: string | null } or { itemIds: string[], targetBoxId: string | null }.
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

    const body = (await request.json()) as {
      itemId?: string
      itemIds?: string[]
      targetBoxId?: string | null
    }
    const targetBoxId = body.targetBoxId ?? null
    const itemIds = body.itemIds ?? (body.itemId ? [body.itemId] : null)

    if (!itemIds || itemIds.length === 0) {
      return NextResponse.json(
        { error: "itemId or itemIds array is required" },
        { status: 400 }
      )
    }

    for (const itemId of itemIds) {
      await moveItem(supabase, user.id, itemId, targetBoxId)
    }

    return NextResponse.json({ success: true, movedCount: itemIds.length })
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to move item"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
