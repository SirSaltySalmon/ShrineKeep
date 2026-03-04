import type { createSupabaseServerClient } from "@/lib/supabase/server"
import { validateBoxesBelongToUser } from "./validation"
import { getPhotosToDeleteFromStorage } from "./delete-item"

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

export type BoxDeleteMode = "delete-all" | "move-to-root"

/**
 * Collect all descendant box IDs for a given box (recursively).
 */
export async function collectBoxDescendants(
  supabase: Supabase,
  userId: string,
  boxId: string
): Promise<string[]> {
  const descendantIds: string[] = []
  let currentLevel: string[] = [boxId]

  while (currentLevel.length > 0) {
    const { data: children, error } = await supabase
      .from("boxes")
      .select("id")
      .in("parent_box_id", currentLevel)
      .eq("user_id", userId)

    if (error) throw error
    if (!children?.length) break

    const ids = children.map((c) => c.id)
    descendantIds.push(...ids)
    currentLevel = ids
  }

  return descendantIds
}

/**
 * Collect all item IDs that belong to the given boxes (including descendants).
 */
async function collectItemIdsFromBoxes(
  supabase: Supabase,
  userId: string,
  boxIds: string[]
): Promise<string[]> {
  // Collect all descendant boxes
  const allDescendantIds = new Set<string>()
  for (const boxId of boxIds) {
    const descendants = await collectBoxDescendants(supabase, userId, boxId)
    descendants.forEach((id) => allDescendantIds.add(id))
  }

  const allBoxIds = Array.from(new Set(boxIds.concat(Array.from(allDescendantIds))))

  // Fetch all items in these boxes
  const { data: items, error } = await supabase
    .from("items")
    .select("id")
    .in("box_id", allBoxIds)
    .eq("user_id", userId)

  if (error) throw error

  return (items ?? []).map((item) => item.id)
}

/**
 * Delete boxes (unified function for single or batch).
 * Processes all boxes together instead of sequentially.
 */
export async function deleteBoxes(
  supabase: Supabase,
  userId: string,
  boxIds: string[],
  mode: BoxDeleteMode
): Promise<{ deletedCount: number }> {
  if (boxIds.length === 0) {
    return { deletedCount: 0 }
  }

  // Validate all boxes belong to user (for better error messages)
  const validBoxIds = await validateBoxesBelongToUser(supabase, userId, boxIds)
  if (validBoxIds.size !== boxIds.length) {
    throw new Error("Some boxes not found or do not belong to user")
  }

  if (mode === "delete-all") {
    // Collect all item IDs that will be deleted (including descendants)
    const itemIds = await collectItemIdsFromBoxes(supabase, userId, boxIds)

    // Clean up photo storage before CASCADE deletion
    if (itemIds.length > 0) {
      const { data: allPhotos, error: photosError } = await supabase
        .from("photos")
        .select("storage_path, item_id")
        .in("item_id", itemIds)

      if (photosError) {
        console.error("Error fetching photos:", photosError)
      } else {
        const storagePaths = (allPhotos ?? [])
          .map((p) => p.storage_path)
          .filter((path): path is string => path != null && path !== "")

        if (storagePaths.length > 0) {
          const toDeleteFromStorage = await getPhotosToDeleteFromStorage(
            supabase,
            userId,
            itemIds,
            storagePaths
          )

          if (toDeleteFromStorage.length > 0) {
            const { error: storageError } = await supabase.storage
              .from("item-photos")
              .remove(toDeleteFromStorage)
            if (storageError) {
              console.error("Error deleting photos from storage:", storageError)
            }
          }
        }
      }
    }

    // Batch delete all boxes (CASCADE will handle children)
    const { error } = await supabase
      .from("boxes")
      .delete()
      .in("id", boxIds)
      .eq("user_id", userId)
    if (error) throw error
    return { deletedCount: boxIds.length }
  }

  // move-to-root mode: collect all descendants for all boxes
  const allDescendantIds = new Set<string>()
  for (const boxId of boxIds) {
    const descendants = await collectBoxDescendants(supabase, userId, boxId)
    descendants.forEach((id) => allDescendantIds.add(id))
  }

  const allBoxIds = Array.from(new Set(boxIds.concat(Array.from(allDescendantIds))))

  // Batch move all boxes and their descendants to root
  const { error: errBoxes } = await supabase
    .from("boxes")
    .update({ parent_box_id: null })
    .in("id", allBoxIds)
    .eq("user_id", userId)
  if (errBoxes) throw errBoxes

  // Batch move all items in these boxes to root
  const { error: errItems } = await supabase
    .from("items")
    .update({ box_id: null })
    .in("box_id", allBoxIds)
    .eq("user_id", userId)
  if (errItems) throw errItems

  // Batch delete the target boxes
  const { error: errDelete } = await supabase
    .from("boxes")
    .delete()
    .in("id", boxIds)
    .eq("user_id", userId)
  if (errDelete) throw errDelete

  return { deletedCount: boxIds.length }
}

