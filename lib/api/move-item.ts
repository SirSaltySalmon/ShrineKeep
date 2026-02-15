import type { createSupabaseServerClient } from "@/lib/supabase/server"

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

/**
 * Move one item to a target box. Verifies item belongs to user.
 */
export async function moveItem(
  supabase: Supabase,
  userId: string,
  itemId: string,
  targetBoxId: string | null
): Promise<void> {
  const { error } = await supabase
    .from("items")
    .update({ box_id: targetBoxId })
    .eq("id", itemId)
    .eq("user_id", userId)

  if (error) throw error
}
