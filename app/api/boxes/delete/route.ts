import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { deleteOneBox, type BoxDeleteMode } from "@/lib/api/delete-box"

type BoxDeletePayload = { boxId: string; mode: BoxDeleteMode }

/**
 * Delete one or more boxes. Body: { boxId, mode } or { boxes: { boxId, mode }[] }.
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

    const body = (await request.json()) as { boxId?: string; mode?: BoxDeleteMode; boxes?: BoxDeletePayload[] }
    const list: BoxDeletePayload[] = body.boxes ?? (body.boxId && body.mode ? [{ boxId: body.boxId, mode: body.mode }] : [])

    if (list.length === 0) {
      return NextResponse.json(
        { error: "boxId and mode, or boxes array, required" },
        { status: 400 }
      )
    }

    for (const { boxId, mode } of list) {
      if (mode !== "delete-all" && mode !== "move-to-root") {
        return NextResponse.json({ error: "Invalid mode" }, { status: 400 })
      }
      await deleteOneBox(supabase, user.id, boxId, mode)
    }

    return NextResponse.json({ success: true, deletedCount: list.length })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete box"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
