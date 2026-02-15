import type { createSupabaseServerClient } from "@/lib/supabase/server"

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

export type BoxDeleteMode = "delete-all" | "move-to-root"

/**
 * Delete one box. delete-all: CASCADE deletes children. move-to-root: move children to root then delete box.
 */
export async function deleteOneBox(
  supabase: Supabase,
  userId: string,
  boxId: string,
  mode: BoxDeleteMode
): Promise<void> {
  if (mode === "delete-all") {
    const { error } = await supabase
      .from("boxes")
      .delete()
      .eq("id", boxId)
      .eq("user_id", userId)
    if (error) throw error
    return
  }

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
}
