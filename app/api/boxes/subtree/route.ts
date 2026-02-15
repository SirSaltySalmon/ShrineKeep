import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/**
 * Get all descendant boxes and all items in the subtree for given root box ids.
 * Body: { rootIds: string[] }. Returns { boxes: Box[], items: Item[] } for building BoxCopyPayload client-side.
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

    const allBoxIds = new Set<string>(rootIds)
    let currentLevel = [...rootIds]

    while (currentLevel.length > 0) {
      const { data: children } = await supabase
        .from("boxes")
        .select("id")
        .in("parent_box_id", currentLevel)
        .eq("user_id", user.id)

      if (!children?.length) break
      currentLevel = children.map((c) => c.id)
      currentLevel.forEach((id) => allBoxIds.add(id))
    }

    const idList = Array.from(allBoxIds)

    const { data: boxes, error: boxesError } = await supabase
      .from("boxes")
      .select("*")
      .in("id", idList)
      .eq("user_id", user.id)
      .order("position", { ascending: true })

    if (boxesError) throw boxesError

    const { data: items, error: itemsError } = await supabase
      .from("items")
      .select(`
        *,
        photos (*),
        item_tags (
          tag:tags (*)
        )
      `)
      .in("box_id", idList)
      .eq("user_id", user.id)
      .order("position", { ascending: true })

    if (itemsError) throw itemsError

    return NextResponse.json({
      boxes: boxes ?? [],
      items: items ?? [],
    })
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch subtree"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
