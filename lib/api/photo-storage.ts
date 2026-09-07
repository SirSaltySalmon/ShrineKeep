import type { createSupabaseServerClient } from "@/lib/supabase/server"

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

export type PhotoStorageRow = {
  id: string
  storage_path: string | null
  asset_id?: string | null
}

function isUserOwnedStoragePath(path: string, userId: string): boolean {
  const parts = path.split("/")
  return parts.length >= 2 && parts[0] === userId
}

/**
 * Storage paths that should be removed from the bucket after the given photo
 * rows are deleted. A path is kept when any other photo row (including other
 * items, e.g. copy/paste) still references it. Registered assets are omitted;
 * their blobs are reclaimed by the media GC queue after the last reference.
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

async function removeUnregisteredBlobs(
  supabase: Supabase,
  userId: string,
  photos: PhotoStorageRow[]
): Promise<number> {
  const unregistered = photos.filter((photo) => !photo.asset_id)
  const storagePaths = unregistered
    .map((photo) => photo.storage_path)
    .filter((path): path is string => path != null && path !== "")
  if (storagePaths.length === 0) return 0
  const toRemove = await getStoragePathsUnreferencedAfterPhotoDelete(
    supabase,
    userId,
    unregistered.map((photo) => photo.id),
    storagePaths
  )
  if (toRemove.length === 0) return 0
  const { error: storageError } = await supabase.storage.from("item-photos").remove(toRemove)
  if (!storageError) return toRemove.length
  console.error("Error deleting photos from storage:", storageError)
  return 0
}

/**
 * Delete photo rows first, then remove unregistered blobs only when no remaining
 * photo row references the same storage_path. Registered assets stay until GC.
 * Empty input is a no-op (idempotent).
 */
export async function deletePhotoRowsAndUnreferencedStorage(
  supabase: Supabase,
  userId: string,
  photos: PhotoStorageRow[]
): Promise<{ deletedCount: number; deletedFromStorage: number }> {
  if (photos.length === 0) {
    return { deletedCount: 0, deletedFromStorage: 0 }
  }

  const photoIds = photos.map((photo) => photo.id)
  const { error: deleteError } = await supabase.from("photos").delete().in("id", photoIds)
  if (deleteError) throw deleteError

  const deletedFromStorage = await removeUnregisteredBlobs(supabase, userId, photos)
  return { deletedCount: photos.length, deletedFromStorage }
}

/** After item/box rows are already gone, remove leftover unregistered blobs. */
export async function removeUnreferencedUnregisteredStorage(
  supabase: Supabase,
  userId: string,
  photos: PhotoStorageRow[]
): Promise<number> {
  return removeUnregisteredBlobs(supabase, userId, photos)
}
