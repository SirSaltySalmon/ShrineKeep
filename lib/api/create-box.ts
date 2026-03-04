import type { createSupabaseServerClient } from "@/lib/supabase/server"
import { validateBoxesBelongToUser } from "./validation"

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

interface CreateBoxParams {
  supabase: Supabase
  userId: string
  boxData: {
    name: string
    description?: string | null
    parent_box_id?: string | null
    position?: number
  }
}

/**
 * Create boxes (unified function for single or batch).
 * Validates ownership of parent boxes if provided.
 */
export async function createBoxes(
  supabase: Supabase,
  userId: string,
  boxes: Array<{
    name: string
    description?: string | null
    parent_box_id?: string | null
    position?: number
  }>
): Promise<string[]> {
  if (boxes.length === 0) {
    return []
  }

  // Validate all parent boxes belong to user if provided
  const parentBoxIds = boxes
    .map((b) => b.parent_box_id)
    .filter((id): id is string => id != null && id !== "")

  if (parentBoxIds.length > 0) {
    const validParentIds = await validateBoxesBelongToUser(supabase, userId, parentBoxIds)
    if (validParentIds.size !== parentBoxIds.length) {
      throw new Error("Some parent boxes not found or do not belong to user")
    }
  }

  // Batch insert all boxes
  const boxDataArray = boxes.map((box) => ({
    name: box.name.trim(),
    description: box.description?.trim() || null,
    parent_box_id: box.parent_box_id || null,
    position: box.position ?? 0,
    user_id: userId,
    is_public: false,
  }))

  const { data: newBoxes, error } = await supabase
    .from("boxes")
    .insert(boxDataArray)
    .select("id")

  if (error) throw error
  if (!newBoxes || newBoxes.length !== boxes.length) {
    throw new Error(`Failed to create all boxes: expected ${boxes.length}, got ${newBoxes?.length ?? 0}`)
  }

  return newBoxes.map((box) => box.id)
}

