import { moveItems } from "@/lib/api/move-item"
import type { createSupabaseServerClient } from "@/lib/supabase/server"

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

export interface MoveItemsRequestBody {
  itemId?: string
  itemIds?: string[]
  targetBoxId?: string | null
}

export function parseMoveItemsRequest(body: MoveItemsRequestBody): {
  itemIds: string[]
  targetBoxId: string | null
} {
  const targetBoxId = body.targetBoxId ?? null
  const itemIds = body.itemIds ?? (body.itemId ? [body.itemId] : null)

  if (!itemIds || itemIds.length === 0) {
    throw new Error("itemId or itemIds array is required")
  }

  return { itemIds, targetBoxId }
}

export async function moveItemsForUser(
  supabase: Supabase,
  userId: string,
  body: MoveItemsRequestBody
) {
  const { itemIds, targetBoxId } = parseMoveItemsRequest(body)
  return moveItems(supabase, userId, itemIds, targetBoxId)
}
