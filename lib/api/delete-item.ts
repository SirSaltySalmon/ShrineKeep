import type { createSupabaseServerClient } from "@/lib/supabase/server"
import { validateItemsBelongToUser } from "./validation"
import { removeUnreferencedUnregisteredStorage } from "./photo-storage"

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

/**
 * Delete items (unified function for single or batch).
 * Deletes rows first. Unregistered blobs are removed only when no remaining
 * photo row references that storage_path. Registered assets are left for GC.
 */
export async function deleteItems(
  supabase: Supabase,
  userId: string,
  itemIds: string[]
): Promise<{ deletedPhotos: number; deletedCount: number }> {
  if (itemIds.length === 0) {
    return { deletedPhotos: 0, deletedCount: 0 }
  }

  const validItemIds = await validateItemsBelongToUser(supabase, userId, itemIds)
  if (validItemIds.size !== itemIds.length) {
    throw new Error("Some items not found or do not belong to user")
  }

  const { data: allPhotos, error: photosError } = await supabase
    .from("photos")
    .select("id, storage_path, item_id, asset_id")
    .in("item_id", itemIds)

  if (photosError) {
    console.error("Error fetching photos:", photosError)
  }

  const { error: deleteError } = await supabase
    .from("items")
    .delete()
    .in("id", itemIds)
    .eq("user_id", userId)

  if (deleteError) throw deleteError

  const deletedFromStorage = await removeUnreferencedUnregisteredStorage(
    supabase,
    userId,
    allPhotos ?? []
  )

  return { deletedPhotos: deletedFromStorage, deletedCount: itemIds.length }
}
