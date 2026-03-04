import type { createSupabaseServerClient } from "@/lib/supabase/server"
import { validateBoxesBelongToUser } from "./validation"

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

/**
 * Validate that moving boxes to a target parent won't create cycles.
 * Handles single or multiple boxes efficiently in minimal queries.
 * Throws an error if any move would create a cycle.
 */
export async function validateBoxesMove(
  supabase: Supabase,
  userId: string,
  boxIds: string[],
  targetParentBoxId: string | null
): Promise<void> {
  if (boxIds.length === 0) return

  // Check if any box is trying to be moved into itself
  if (targetParentBoxId !== null && boxIds.includes(targetParentBoxId)) {
    throw new Error("A box cannot be moved into itself")
  }

  // If moving to root, no cycle possible
  if (!targetParentBoxId) return

  // Fetch ancestor chain for targetParentBoxId once
  const ancestorChain = new Set<string>()
  let ancestorId: string | null = targetParentBoxId

  while (ancestorId) {
    ancestorChain.add(ancestorId)
    const response: { data: { parent_box_id: string | null } | null; error: any } = await supabase
      .from("boxes")
      .select("parent_box_id")
      .eq("id", ancestorId)
      .eq("user_id", userId)
      .single<{ parent_box_id: string | null }>()

    if (response.error) throw response.error
    ancestorId = response.data?.parent_box_id ?? null
  }

  // Check all boxes against ancestor chain in memory
  for (const boxId of boxIds) {
    if (ancestorChain.has(boxId)) {
      throw new Error(`Cannot move box ${boxId} into its own descendant`)
    }
  }
}

/**
 * Move boxes (unified function for single or batch).
 * Validates ownership and prevents cycles for all boxes.
 */
export async function moveBoxes(
  supabase: Supabase,
  userId: string,
  boxIds: string[],
  targetParentBoxId: string | null
): Promise<{ movedCount: number }> {
  if (boxIds.length === 0) {
    return { movedCount: 0 }
  }

  // Validate all boxes belong to user (for better error messages)
  const validBoxIds = await validateBoxesBelongToUser(supabase, userId, boxIds)
  if (validBoxIds.size !== boxIds.length) {
    throw new Error("Some boxes not found or do not belong to user")
  }

  // Validate cycle prevention for all boxes in single query
  await validateBoxesMove(supabase, userId, boxIds, targetParentBoxId)

  // Batch update all boxes to target parent
  const { error: updateError } = await supabase
    .from("boxes")
    .update({ parent_box_id: targetParentBoxId || null })
    .in("id", boxIds)
    .eq("user_id", userId)

  if (updateError) throw updateError

  return { movedCount: boxIds.length }
}

