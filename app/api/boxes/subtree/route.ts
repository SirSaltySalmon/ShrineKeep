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

    // Fetch value_history for all items
    const itemIds = (items ?? []).map((item: { id: string }) => item.id)
    let valueHistoryMap = new Map<string, Array<{ value: number; recorded_at: string }>>()

    if (itemIds.length > 0) {
      const { data: valueHistory, error: historyError } = await supabase
        .from("value_history")
        .select("item_id, value, recorded_at")
        .in("item_id", itemIds)
        .order("recorded_at", { ascending: true })

      if (historyError) throw historyError

      // Group value_history by item_id
      for (const record of valueHistory ?? []) {
        if (!valueHistoryMap.has(record.item_id)) {
          valueHistoryMap.set(record.item_id, [])
        }
        valueHistoryMap.get(record.item_id)!.push({
          value: Number(record.value),
          recorded_at: record.recorded_at,
        })
      }
    }

    // Attach value_history to items
    const itemsWithHistory = (items ?? []).map((item: { id: string }) => ({
      ...item,
      value_history: valueHistoryMap.get(item.id) ?? [],
    }))

    return NextResponse.json({
      boxes: boxes ?? [],
      items: itemsWithHistory,
    })
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch subtree"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
