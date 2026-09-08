import { countDescendantsById, normalizeBox } from "@/lib/sharing/box-editor"
import { normalizeItem, sortTagsByColorThenName } from "@/lib/utils"
import type { createSupabaseServerClient } from "@/lib/supabase/server"
import type { Box, Item, Tag } from "@/lib/types"

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

export async function loadDashboardRootData(supabase: Supabase, userId: string): Promise<{
  initialBoxes: Box[]
  initialItems: Item[]
  initialTags: Tag[]
  descendantCounts: Record<string, number>
}> {
  const [{ data: initialBoxes }, { data: initialItems }, { data: initialTags }, { data: tree }] = await Promise.all([
    supabase
      .from("boxes")
      .select("*")
      .eq("user_id", userId)
      .is("parent_box_id", null)
      .order("position", { ascending: true }),
    supabase
      .from("items")
      .select(`
        *,
        photos (*),
        item_tags (
          tag:tags (*)
        )
      `)
      .eq("user_id", userId)
      .eq("is_wishlist", false)
      .is("box_id", null)
      .order("position", { ascending: true }),
    supabase.from("tags").select("*").eq("user_id", userId),
    supabase.from("boxes").select("id, parent_box_id").eq("user_id", userId),
  ])

  const descendantCounts = countDescendantsById(tree ?? [])

  return {
    initialBoxes: (initialBoxes ?? []).map((box) => normalizeBox(box, descendantCounts)),
    initialItems: (initialItems ?? []).map(normalizeItem),
    initialTags: sortTagsByColorThenName(initialTags ?? []),
    descendantCounts,
  }
}
