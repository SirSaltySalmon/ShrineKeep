import type { SupabaseClient } from "@supabase/supabase-js"
import { runMediaGc } from "@/lib/media/server/gc-worker"
import { createMediaGcDependencies } from "@/lib/media/server/gc-deps"

function envelope(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

/**
 * Queue the owner's registered assets for GC and drain as many as the time budget allows.
 * Does not recursively delete Storage prefixes; the worker owns blob removal.
 */
export async function deleteUserStorage(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ itemPhotosDeleted: number; avatarsDeleted: number }> {
  const queued = await supabase.rpc("media_queue_owner_purge", { p_owner_id: userId })
  if (queued.error) throw new Error(`media_queue_owner_purge: ${queued.error.message}`)
  const data = envelope(envelope(queued.data)?.data)
  const itemQueued = typeof data?.itemPhotosQueued === "number" ? data.itemPhotosQueued : 0
  const avatarQueued = typeof data?.avatarsQueued === "number" ? data.avatarsQueued : 0

  const deps = createMediaGcDependencies(supabase as never)
  const started = Date.now()
  let deleted = 0
  while (Date.now() - started < 20_000) {
    const batch = await runMediaGc(deps)
    deleted += batch.deleted
    if (batch.claimed === 0) break
  }

  return {
    itemPhotosDeleted: itemQueued > 0 ? Math.min(deleted, itemQueued) : deleted,
    avatarsDeleted: avatarQueued,
  }
}
