import { normalizeItem, sortTagsByColorThenName } from "@/lib/utils"
import type { createSupabaseServerClient } from "@/lib/supabase/server"
import type { Box, Item, Tag } from "@/lib/types"

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

export async function loadDashboardRootData(supabase: Supabase, userId: string): Promise<{
  initialBoxes: Box[]
  initialItems: Item[]
  initialTags: Tag[]
}> {
  const [{ data: initialBoxes }, { data: initialItems }, { data: initialTags }] = await Promise.all([
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
  ])

  return {
    initialBoxes: initialBoxes ?? [],
    initialItems: (initialItems ?? []).map(normalizeItem),
    initialTags: sortTagsByColorThenName(initialTags ?? []),
  }
}
