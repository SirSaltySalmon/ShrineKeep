import type { createSupabaseServerClient } from "@/lib/supabase/server"
import type { ItemCopyPayload } from "@/lib/types"

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

/**
 * Create one collection item from copy payload (e.g. for paste). Reuses same logic as POST /api/items for new items.
 */
export async function createItemFromPayload(
  supabase: Supabase,
  userId: string,
  payload: ItemCopyPayload,
  boxId: string | null
): Promise<string> {
  const thumbnailUrl =
    payload.photos?.find((p) => p.is_thumbnail)?.url ?? payload.thumbnail_url ?? null
  const acquisitionDate =
    payload.acquisition_date ?? new Date().toISOString().split("T")[0]

  const itemData = {
    name: payload.name.trim(),
    description: payload.description?.trim() || null,
    current_value: payload.current_value ?? null,
    acquisition_date: acquisitionDate,
    acquisition_price: payload.acquisition_price ?? null,
    expected_price: null,
    thumbnail_url: thumbnailUrl,
    box_id: boxId,
    user_id: userId,
    is_wishlist: false,
  }

  const { data: newItem, error } = await supabase
    .from("items")
    .insert(itemData)
    .select("id")
    .single()

  if (error) throw error
  if (!newItem) throw new Error("Failed to create item")
  const itemId = newItem.id

  if (payload.photos?.length) {
    const { error: insertError } = await supabase.from("photos").insert(
      payload.photos.map((p) => ({
        item_id: itemId,
        url: p.url,
        storage_path: p.storage_path ?? null,
        is_thumbnail: p.is_thumbnail,
      }))
    )
    if (insertError) throw insertError
  }

  const newVal = payload.current_value ?? 0
  const { error: historyErr } = await supabase
    .from("value_history")
    .insert({ item_id: itemId, value: newVal })
  if (historyErr) throw historyErr

  const tagIds = Array.isArray(payload.tag_ids) ? payload.tag_ids : []
  if (tagIds.length > 0) {
    const { data: userTags } = await supabase
      .from("tags")
      .select("id")
      .eq("user_id", userId)
      .in("id", tagIds)
    const validTagIds = (userTags ?? []).map((t) => t.id)
    if (validTagIds.length > 0) {
      await supabase
        .from("item_tags")
        .insert(validTagIds.map((tag_id) => ({ item_id: itemId, tag_id })))
    }
  }

  return itemId
}
