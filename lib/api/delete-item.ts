import type { createSupabaseServerClient } from "@/lib/supabase/server"

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

/**
 * Delete one item and its photo rows. Only deletes a file from storage if
 * no other item's photo row references that storage_path (shared refs after copy/paste).
 * Single query for all paths to check references.
 */
export async function deleteItemWithPhotoRefCheck(
  supabase: Supabase,
  userId: string,
  itemId: string
): Promise<{ deletedPhotos: number }> {
  const { data: item, error: itemError } = await supabase
    .from("items")
    .select("id, user_id")
    .eq("id", itemId)
    .eq("user_id", userId)
    .single()

  if (itemError || !item) {
    throw new Error("Item not found")
  }

  const { data: photos, error: photosError } = await supabase
    .from("photos")
    .select("storage_path")
    .eq("item_id", itemId)

  if (photosError) {
    console.error("Error fetching photos:", photosError)
  }

  const storagePaths = (photos ?? [])
    .map((p) => p.storage_path)
    .filter((path): path is string => path != null && path !== "")

  let deletedFromStorage = 0
  if (storagePaths.length > 0) {
    const validPaths = storagePaths.filter((path) => {
      const parts = path.split("/")
      return parts.length >= 2 && parts[0] === userId
    })
    if (validPaths.length > 0) {
      const { data: stillReferenced } = await supabase
        .from("photos")
        .select("storage_path, items!inner(user_id)")
        .in("storage_path", validPaths)
        .neq("item_id", itemId)
        .eq("items.user_id", userId)

      const referencedSet = new Set(
        (stillReferenced ?? []).map((r) => r.storage_path).filter(Boolean)
      )
      const toDeleteFromStorage = validPaths.filter((p) => !referencedSet.has(p))
      if (toDeleteFromStorage.length > 0) {
        const { error: storageError } = await supabase.storage
          .from("item-photos")
          .remove(toDeleteFromStorage)
        if (!storageError) deletedFromStorage = toDeleteFromStorage.length
        else console.error("Error deleting photos from storage:", storageError)
      }
    }
  }

  const { error: deleteError } = await supabase
    .from("items")
    .delete()
    .eq("id", itemId)
    .eq("user_id", userId)

  if (deleteError) throw deleteError
  return { deletedPhotos: deletedFromStorage }
}
