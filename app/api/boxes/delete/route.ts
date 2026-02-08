import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { boxId, mode } = await request.json() as { boxId: string; mode: "delete-all" | "move-to-root" }

    if (!boxId || !mode) {
      return NextResponse.json(
        { error: "boxId and mode (delete-all | move-to-root) required" },
        { status: 400 }
      )
    }

    if (mode !== "delete-all" && mode !== "move-to-root") {
      return NextResponse.json({ error: "Invalid mode" }, { status: 400 })
    }

    const userId = session.user.id

    if (mode === "delete-all") {
      // CASCADE will delete child boxes and items (and value_history, photos, item_tags)
      const { error } = await supabase
        .from("boxes")
        .delete()
        .eq("id", boxId)
        .eq("user_id", userId)

      if (error) throw error
      return NextResponse.json({ success: true })
    }

    // mode === "move-to-root": collect all descendant box IDs, move them and their items to root, then delete
    const descendantIds: string[] = []
    let currentLevel: string[] = [boxId]

    while (currentLevel.length > 0) {
      const { data: children } = await supabase
        .from("boxes")
        .select("id")
        .in("parent_box_id", currentLevel)
        .eq("user_id", userId)

      if (!children?.length) break
      const ids = children.map((c) => c.id)
      descendantIds.push(...ids)
      currentLevel = ids
    }

    const allBoxIds = [boxId, ...descendantIds]

    const { error: errBoxes } = await supabase
      .from("boxes")
      .update({ parent_box_id: null })
      .in("id", allBoxIds)
      .eq("user_id", userId)

    if (errBoxes) throw errBoxes

    const { error: errItems } = await supabase
      .from("items")
      .update({ box_id: null })
      .in("box_id", allBoxIds)
      .eq("user_id", userId)

    if (errItems) throw errItems

    const { error: errDelete } = await supabase
      .from("boxes")
      .delete()
      .eq("id", boxId)
      .eq("user_id", userId)

    if (errDelete) throw errDelete

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete box"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
