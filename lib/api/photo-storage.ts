import type { createSupabaseServerClient } from "@/lib/supabase/server"

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

function isUserOwnedStoragePath(path: string, userId: string): boolean {
  const parts = path.split("/")
  return parts.length >= 2 && parts[0] === userId
}

/**
 * Storage paths that should be removed from the bucket after the given photo
 * rows are deleted. A path is kept when any other photo row (including other
 * items, e.g. copy/paste) still references it.
 */
export async function getStoragePathsUnreferencedAfterPhotoDelete(
  supabase: Supabase,
  userId: string,
  photoIdsToDelete: string[],
  storagePaths: string[]
): Promise<string[]> {
  if (storagePaths.length === 0) return []

  const validPaths = Array.from(
    new Set(storagePaths.filter((path) => path && isUserOwnedStoragePath(path, userId)))
  )
  if (validPaths.length === 0) return []

  const deleteIdSet = new Set(photoIdsToDelete)

  const { data: allReferences, error: refError } = await supabase
    .from("photos")
    .select("id, storage_path, items!inner(user_id)")
    .in("storage_path", validPaths)
    .eq("items.user_id", userId)

  if (refError) {
    console.error("Error checking storage references:", refError)
    return []
  }

  const stillReferenced = new Set(
    (allReferences ?? [])
      .filter((row) => !deleteIdSet.has(row.id))
      .map((row) => row.storage_path)
      .filter(Boolean)
  )

  return validPaths.filter((path) => !stillReferenced.has(path))
}

/**
 * Delete photo rows, and remove their blobs only when no remaining photo row
 * references the same storage_path. Empty input is a no-op (idempotent).
 */
export async function deletePhotoRowsAndUnreferencedStorage(
  supabase: Supabase,
  userId: string,
  photos: Array<{ id: string; storage_path: string | null }>
): Promise<{ deletedCount: number; deletedFromStorage: number }> {
  if (photos.length === 0) {
    return { deletedCount: 0, deletedFromStorage: 0 }
  }

  const photoIds = photos.map((photo) => photo.id)
  const storagePaths = photos
    .map((photo) => photo.storage_path)
    .filter((path): path is string => path != null && path !== "")

  let deletedFromStorage = 0
  if (storagePaths.length > 0) {
    const toRemove = await getStoragePathsUnreferencedAfterPhotoDelete(
      supabase,
      userId,
      photoIds,
      storagePaths
    )
    if (toRemove.length > 0) {
      const { error: storageError } = await supabase.storage.from("item-photos").remove(toRemove)
      if (!storageError) {
        deletedFromStorage = toRemove.length
      } else {
        console.error("Error deleting photos from storage:", storageError)
      }
    }
  }

  const { error: deleteError } = await supabase.from("photos").delete().in("id", photoIds)
  if (deleteError) throw deleteError

  return { deletedCount: photos.length, deletedFromStorage }
}
