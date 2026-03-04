import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { deleteBoxes, type BoxDeleteMode } from "@/lib/api/delete-box"

type BoxDeletePayload = { boxId: string; mode: BoxDeleteMode }

/**
 * Delete one or more boxes. Body: { boxId, mode } or { boxes: { boxId, mode }[] }.
 * Uses optimized batch deletion when multiple boxes provided.
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
      boxId?: string
      mode?: BoxDeleteMode
      boxes?: BoxDeletePayload[]
    }
    const list: BoxDeletePayload[] =
      body.boxes ?? (body.boxId && body.mode ? [{ boxId: body.boxId, mode: body.mode }] : [])

    if (list.length === 0) {
      return NextResponse.json(
        { error: "boxId and mode, or boxes array, required" },
        { status: 400 }
      )
    }

    // Validate modes
    for (const { mode } of list) {
      if (mode !== "delete-all" && mode !== "move-to-root") {
        return NextResponse.json({ error: "Invalid mode" }, { status: 400 })
      }
    }

    // For batch, all boxes must have the same mode
    const modes = new Set(list.map((item) => item.mode))
    if (modes.size > 1) {
      return NextResponse.json(
        { error: "All boxes must have the same delete mode in batch operations" },
        { status: 400 }
      )
    }

    const boxIds = list.map((item) => item.boxId)
    const mode = list[0].mode
    const { deletedCount } = await deleteBoxes(supabase, user.id, boxIds, mode)
    return NextResponse.json({ success: true, deletedCount })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete box"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
