import type { createSupabaseServerClient } from "@/lib/supabase/server"
import { validateTags } from "./validation"
import { isProUser, getEffectiveCap, getItemCount } from "@/lib/subscription"
import { ItemCapExceededError, itemCapErrorFromDb } from "@/lib/api/item-cap-error"

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

type ItemPhotoInput = {
  url: string
  storage_path?: string | null
  asset_id?: string | null
  is_thumbnail: boolean
}

interface CreateItemInput {
  itemData: Record<string, unknown>
  photos?: ItemPhotoInput[]
  tagIds?: string[]
  valueHistory?: { value: number; recorded_at: string }[]
  currentValue?: number | null
}

interface CreateItemsParams {
  supabase: Supabase
  userId: string
  items: CreateItemInput[]
}

interface CreateItemsResult {
  itemIds: string[]
  operations: string[]
}

/**
 * Build photo insert data for an item.
 * Returns array of photo insert objects.
 */
function buildPhotosInsertData(
  itemId: string,
  photos: ItemPhotoInput[]
): Array<{
  item_id: string
  url: string
  storage_path: string | null
  asset_id: string | null
  is_thumbnail: boolean
}> {
  if (photos.length === 0) return []

  return photos.map((p) => ({
    item_id: itemId,
    url: p.url,
    storage_path: p.storage_path ?? null,
    asset_id: p.asset_id ?? null,
    is_thumbnail: p.is_thumbnail,
  }))
}

/**
 * Build value_history insert data for an item.
 * Returns array of value_history insert objects.
 */
function buildValueHistoryInsertData(
  itemId: string,
  valueHistory: { value: number; recorded_at: string }[] | undefined,
  currentValue: number | null | undefined
): Array<{
  item_id: string
  value: number
  recorded_at?: string
}> {
  if (valueHistory && valueHistory.length > 0) {
    // Copy value_history records (for copied items)
    return valueHistory.map((vh) => ({
      item_id: itemId,
      value: vh.value,
      recorded_at: vh.recorded_at,
    }))
  } else if (currentValue != null && valueHistory === undefined) {
    // Create single record for new item (only if valueHistory was not provided at all)
    // If valueHistory is empty array [], don't create - item was copied but has no history
    return [
      {
        item_id: itemId,
        value: currentValue,
      },
    ]
  }
  return []
}

/**
 * Build item_tags insert data for an item.
 * Returns array of item_tags insert objects.
 */
function buildItemTagsInsertData(
  itemId: string,
  tagIds: string[],
  validTagIds: Set<string>
): Array<{
  item_id: string
  tag_id: string
}> {
  if (tagIds.length === 0 || validTagIds.size === 0) return []

  return Array.from(validTagIds)
    .filter((tagId) => tagIds.includes(tagId))
    .map((tag_id) => ({ item_id: itemId, tag_id }))
}

/**
 * Collect and validate all unique tag IDs from items.
 */
async function collectAndValidateTags(
  supabase: Supabase,
  userId: string,
  items: Array<{ tagIds?: string[] }>
): Promise<Set<string>> {
  const allTagIds = new Set<string>()
  for (const item of items) {
    if (item.tagIds) {
      item.tagIds.forEach((id) => allTagIds.add(id))
    }
  }
  return await validateTags(supabase, userId, Array.from(allTagIds))
}

/**
 * Build related data (photos, value_history, tags) for a batch of items.
 */
interface RelatedData {
  photos: Array<{
    item_id: string
    url: string
    storage_path: string | null
    asset_id: string | null
    is_thumbnail: boolean
  }>
  valueHistory: Array<{
    item_id: string
    value: number
    recorded_at?: string
  }>
  tags: Array<{ item_id: string; tag_id: string }>
}

interface ItemWithId {
  itemId: string
  photos?: ItemPhotoInput[]
  tagIds?: string[]
  valueHistory?: { value: number; recorded_at: string }[]
  currentValue?: number | null
}

function buildRelatedData(items: ItemWithId[], validTagIds: Set<string>): RelatedData {
  const result: RelatedData = {
    photos: [],
    valueHistory: [],
    tags: [],
  }

  for (const item of items) {
    result.photos.push(...buildPhotosInsertData(item.itemId, item.photos ?? []))
    result.valueHistory.push(
      ...buildValueHistoryInsertData(item.itemId, item.valueHistory, item.currentValue)
    )
    result.tags.push(...buildItemTagsInsertData(item.itemId, item.tagIds ?? [], validTagIds))
  }

  return result
}

/**
 * Insert related data (photos, value_history, tags).
 */
async function insertRelatedData(
  supabase: Supabase,
  data: RelatedData,
  operations: string[]
): Promise<void> {
  if (data.photos.length > 0) {
    const { error: photosError } = await supabase.from("photos").insert(data.photos)
    if (photosError) throw photosError
    operations.push(`inserted ${data.photos.length} photo(s)`)
  }

  if (data.valueHistory.length > 0) {
    const { error: historyError } = await supabase.from("value_history").insert(data.valueHistory)
    if (historyError) throw historyError
    operations.push(`inserted ${data.valueHistory.length} value_history record(s)`)
  }

  if (data.tags.length > 0) {
    const { error: tagsError } = await supabase.from("item_tags").insert(data.tags)
    if (tagsError) throw tagsError
    operations.push(`inserted ${data.tags.length} item_tag association(s)`)
  }
}

/**
 * Process creates: insert items and their related data.
 */
async function processCreates(
  supabase: Supabase,
  userId: string,
  creates: CreateItemInput[],
  operations: string[]
): Promise<string[]> {
  // Validate tags
  const validTagIds = await collectAndValidateTags(supabase, userId, creates)
  if (validTagIds.size > 0) {
    operations.push(`validated ${validTagIds.size} unique tag(s)`)
  }

  // Insert items
  const itemDataArray = creates.map((item) => item.itemData)
  const { data: newItems, error: itemsError } = await supabase
    .from("items")
    .insert(itemDataArray)
    .select("id")

  if (itemsError) throw itemCapErrorFromDb(itemsError) ?? itemsError
  if (!newItems || newItems.length !== creates.length) {
    throw new Error(`Failed to create all items: expected ${creates.length}, got ${newItems?.length ?? 0}`)
  }

  const createdIds = newItems.map((item) => item.id)
  operations.push(`created ${createdIds.length} item(s)`)

  // Build related data
  const itemsWithIds: ItemWithId[] = creates.map((item, i) => ({
    itemId: createdIds[i]!,
    photos: item.photos,
    tagIds: item.tagIds,
    valueHistory: item.valueHistory,
    currentValue: item.currentValue,
  }))

  const relatedData = buildRelatedData(itemsWithIds, validTagIds)
  await insertRelatedData(supabase, relatedData, operations)

  return createdIds
}

/**
 * Create items (single or batch) with their photos, tags and value_history.
 * Returns the new item IDs and the operations performed.
 */
export async function createItems({
  supabase,
  userId,
  items,
}: CreateItemsParams): Promise<CreateItemsResult> {
  const operations: string[] = []

  if (items.length === 0) {
    return { itemIds: [], operations: ["no items to process"] }
  }

  // Enforce free-tier item cap before inserting non-wishlist items.
  // COUNT then INSERT is not atomic: the enforce_item_cap trigger has the final say,
  // and processCreates maps its rejection to the same ItemCapExceededError.
  const newCollectionCreates = items.filter((c) => c.itemData.is_wishlist === false)
  if (newCollectionCreates.length > 0) {
    const pro = await isProUser(supabase, userId)
    const cap = await getEffectiveCap(supabase, userId, pro)
    if (isFinite(cap)) {
      const currentCount = await getItemCount(supabase, userId)
      if (currentCount + newCollectionCreates.length > cap) {
        throw new ItemCapExceededError(currentCount, cap)
      }
    }
  }

  const itemIds = await processCreates(supabase, userId, items, operations)

  return { itemIds, operations }
}
