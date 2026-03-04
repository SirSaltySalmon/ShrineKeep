import type { createSupabaseServerClient } from "@/lib/supabase/server"
import { validateItemsBelongToUser } from "./validation"

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

/**
 * Move items (unified function for single or batch).
 * Handles both single and batch operations efficiently.
 */
export async function moveItems(
  supabase: Supabase,
  userId: string,
  itemIds: string[],
  targetBoxId: string | null
): Promise<{ movedCount: number }> {
  if (itemIds.length === 0) {
    return { movedCount: 0 }
  }

  // For batch operations, validate ownership for better error messages
  // For single operations, RLS handles security, but validation gives clearer errors
  if (itemIds.length > 1) {
    const validItemIds = await validateItemsBelongToUser(supabase, userId, itemIds)
    if (validItemIds.size !== itemIds.length) {
      throw new Error("Some items not found or do not belong to user")
    }
  }

  // Batch update all items to target box
  const { error: updateError } = await supabase
    .from("items")
    .update({ box_id: targetBoxId })
    .in("id", itemIds)
    .eq("user_id", userId)

  if (updateError) throw updateError

  return { movedCount: itemIds.length }
}

