import type { createSupabaseServerClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase/service"
import { removeUnreferencedUnregisteredStorage, type PhotoStorageRow } from "./photo-storage"

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

export type BoxDeleteMode = "delete-all" | "move-to-root"

export class BoxMutationError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, status: number, message = code) {
    super(message)
    this.name = "BoxMutationError"
    this.code = code
    this.status = status
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function photoRows(value: unknown): PhotoStorageRow[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((row) => {
    const photo = record(row)
    if (!photo || typeof photo.id !== "string") return []
    return [{
      id: photo.id,
      storage_path: typeof photo.storage_path === "string" ? photo.storage_path : null,
      asset_id: typeof photo.asset_id === "string" ? photo.asset_id : null,
    }]
  })
}

/**
 * Delete boxes (unified function for single or batch).
 * Unbox, reparent, wishlist detach, and delete run in one locked RPC.
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

  const uniqueIds = Array.from(new Set(boxIds))
  const service = createSupabaseServiceClient()
  const { data, error } = await service.rpc("sharing_delete_boxes", {
    p_actor_id: userId,
    p_box_ids: uniqueIds,
    p_mode: mode,
  })
  if (error) throw error

  const envelope = record(data)
  if (envelope?.ok === true) {
    const payload = record(envelope.data)
    const deletedCount = payload?.deletedCount
    if (typeof deletedCount !== "number" || !Number.isSafeInteger(deletedCount) || deletedCount < 0) {
      throw new BoxMutationError("temporarily_unavailable", 503)
    }
    if (mode === "delete-all") {
      await removeUnreferencedUnregisteredStorage(supabase, userId, photoRows(payload.photos))
    }
    return { deletedCount }
  }

  const failure = record(envelope?.error)
  const code = typeof failure?.code === "string" ? failure.code : "temporarily_unavailable"
  const status = typeof failure?.status === "number" ? failure.status : 503
  throw new BoxMutationError(code, status)
}
