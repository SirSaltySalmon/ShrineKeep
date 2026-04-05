import type { SupabaseClient } from "@supabase/supabase-js"

const LIST_PAGE = 500
const REMOVE_CHUNK = 100

/** Supabase list(): folders have `id === null`; files have a non-null id. */
function isStorageFolder(item: { id: string | null }): boolean {
  return item.id === null
}

/**
 * Recursively collect object paths under a storage prefix (files only).
 */
async function collectFilePaths(
  supabase: SupabaseClient,
  bucket: string,
  prefix: string
): Promise<string[]> {
  const out: string[] = []
  let offset = 0

  for (;;) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit: LIST_PAGE,
      offset,
      sortBy: { column: "name", order: "asc" },
    })

    if (error) {
      throw new Error(`storage list ${bucket}/${prefix}: ${error.message}`)
    }

    if (!data?.length) {
      break
    }

    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name
      if (isStorageFolder(item)) {
        const nested = await collectFilePaths(supabase, bucket, path)
        out.push(...nested)
      } else {
        out.push(path)
      }
    }

    if (data.length < LIST_PAGE) {
      break
    }
    offset += LIST_PAGE
  }

  return out
}

async function removePaths(
  supabase: SupabaseClient,
  bucket: string,
  paths: string[]
): Promise<number> {
  let deleted = 0
  for (let i = 0; i < paths.length; i += REMOVE_CHUNK) {
    const chunk = paths.slice(i, i + REMOVE_CHUNK)
    const { error } = await supabase.storage.from(bucket).remove(chunk)
    if (error) {
      throw new Error(`storage remove ${bucket}: ${error.message}`)
    }
    deleted += chunk.length
  }
  return deleted
}

/**
 * Deletes all objects under the user's known prefixes: item photos and avatars.
 */
export async function deleteUserStorage(
  supabase: SupabaseClient,
  userId: string
): Promise<{ itemPhotosDeleted: number; avatarsDeleted: number }> {
  const itemPaths = await collectFilePaths(supabase, "item-photos", `${userId}/items`)
  const avatarPaths = await collectFilePaths(supabase, "avatars", userId)

  const itemPhotosDeleted = await removePaths(supabase, "item-photos", itemPaths)
  const avatarsDeleted = await removePaths(supabase, "avatars", avatarPaths)

  return { itemPhotosDeleted, avatarsDeleted }
}
