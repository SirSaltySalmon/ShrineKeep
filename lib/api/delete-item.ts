import type { createSupabaseServerClient } from "@/lib/supabase/server"
import { validateItemsBelongToUser } from "./validation"

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

/**
 * Get storage paths that should be deleted from storage.
 * Only deletes files if no other item's photo row references that storage_path
 * (shared refs after copy/paste).
 */
export async function getPhotosToDeleteFromStorage(
  supabase: Supabase,
  userId: string,
  itemIds: string[],
  storagePaths: string[]
): Promise<string[]> {
  if (storagePaths.length === 0) return []

  // Filter to only paths that belong to this user
  const validPaths = storagePaths.filter((path) => {
    const parts = path.split("/")
    return parts.length >= 2 && parts[0] === userId
  })

  if (validPaths.length === 0) return []

  // Check which storage paths are still referenced by other items
  // Fetch all references, then filter out references from items being deleted
  const { data: allReferences, error: refError } = await supabase
    .from("photos")
    .select("storage_path, item_id, items!inner(user_id)")
    .in("storage_path", validPaths)
    .eq("items.user_id", userId)

  if (refError) {
    console.error("Error checking storage references:", refError)
    return []
  }

  // Filter out references from items being deleted
  const referencedSet = new Set(
    (allReferences ?? [])
      .filter((r) => !itemIds.includes(r.item_id))
      .map((r) => r.storage_path)
      .filter(Boolean)
  )

  return validPaths.filter((p) => !referencedSet.has(p))
}

/**
 * Delete items (unified function for single or batch).
 * Only deletes files from storage if no other item's photo row references that storage_path
 * (shared refs after copy/paste).
 */
export async function deleteItems(
  supabase: Supabase,
  userId: string,
  itemIds: string[]
): Promise<{ deletedPhotos: number; deletedCount: number }> {
  if (itemIds.length === 0) {
    return { deletedPhotos: 0, deletedCount: 0 }
  }

  // Validate all items belong to user (for better error messages)
  // For single operations, RLS handles security, but validation gives clearer errors
  const validItemIds = await validateItemsBelongToUser(supabase, userId, itemIds)
  if (validItemIds.size !== itemIds.length) {
    throw new Error("Some items not found or do not belong to user")
  }

  // Batch fetch all photos for all items
  const { data: allPhotos, error: photosError } = await supabase
    .from("photos")
    .select("storage_path, item_id")
    .in("item_id", itemIds)

  if (photosError) {
    console.error("Error fetching photos:", photosError)
  }

  // Collect all unique storage paths
  const storagePaths = (allPhotos ?? [])
    .map((p) => p.storage_path)
    .filter((path): path is string => path != null && path !== "")

  let deletedFromStorage = 0
  if (storagePaths.length > 0) {
    const toDeleteFromStorage = await getPhotosToDeleteFromStorage(
      supabase,
      userId,
      itemIds,
      storagePaths
    )

    // Batch delete from storage
    if (toDeleteFromStorage.length > 0) {
      const { error: storageError } = await supabase.storage
        .from("item-photos")
        .remove(toDeleteFromStorage)
      if (!storageError) {
        deletedFromStorage = toDeleteFromStorage.length
      } else {
        console.error("Error deleting photos from storage:", storageError)
      }
    }
  }

  // Batch delete all items (CASCADE will handle photos, item_tags, value_history)
  const { error: deleteError } = await supabase
    .from("items")
    .delete()
    .in("id", itemIds)
    .eq("user_id", userId)

  if (deleteError) throw deleteError

  return { deletedPhotos: deletedFromStorage, deletedCount: itemIds.length }
}

