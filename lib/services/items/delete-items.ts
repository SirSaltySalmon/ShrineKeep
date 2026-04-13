import { deleteItems } from "@/lib/api/delete-item"
import type { createSupabaseServerClient } from "@/lib/supabase/server"

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

export interface DeleteItemsRequestBody {
  itemId?: string
  itemIds?: string[]
}

export function parseDeleteItemsRequest(body: DeleteItemsRequestBody): string[] {
  const itemIds = body.itemIds ?? (body.itemId ? [body.itemId] : null)
  if (!itemIds || itemIds.length === 0) {
    throw new Error("itemId or itemIds array is required")
  }
  return itemIds
}

export async function deleteItemsForUser(
  supabase: Supabase,
  userId: string,
  body: DeleteItemsRequestBody
) {
  const itemIds = parseDeleteItemsRequest(body)
  return deleteItems(supabase, userId, itemIds)
}
