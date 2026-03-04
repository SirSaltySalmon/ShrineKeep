import type { createSupabaseServerClient } from "@/lib/supabase/server"
import type { ItemCopyPayload } from "@/lib/types"
import { validateTags } from "./validation"

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

interface CreateItemParams {
  supabase: Supabase
  userId: string
  itemData: Record<string, unknown>
  photos?: { url: string; storage_path?: string | null; is_thumbnail: boolean }[]
  tagIds?: string[]
  valueHistory?: { value: number; recorded_at: string }[]
  currentValue?: number | null
  isUpdate?: boolean
  itemId?: string
}

interface CreateItemResult {
  itemId: string
  operations: string[]
}

interface CreateItemsParams {
  supabase: Supabase
  userId: string
  items: Array<{
    itemData: Record<string, unknown>
    photos?: { url: string; storage_path?: string | null; is_thumbnail: boolean }[]
    tagIds?: string[]
    valueHistory?: { value: number; recorded_at: string }[]
    currentValue?: number | null
    isUpdate?: boolean
    itemId?: string
  }>
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
  photos: { url: string; storage_path?: string | null; is_thumbnail: boolean }[]
): Array<{
  item_id: string
  url: string
  storage_path: string | null
  is_thumbnail: boolean
}> {
  if (photos.length === 0) return []

  return photos.map((p) => ({
    item_id: itemId,
    url: p.url,
    storage_path: p.storage_path ?? null,
    is_thumbnail: p.is_thumbnail,
  }))
}

/**
 * Build value_history insert data for an item.
 * Returns array of value_history insert objects.
 * For updates, this returns empty array - caller must check if value changed separately.
 */
function buildValueHistoryInsertData(
  itemId: string,
  valueHistory: { value: number; recorded_at: string }[] | undefined,
  currentValue: number | null | undefined,
  isUpdate: boolean
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
  } else if (!isUpdate && currentValue != null && valueHistory === undefined) {
    // Create single record for new item (only if valueHistory was not provided at all)
    // If valueHistory is empty array [], don't create - item was copied but has no history
    return [
      {
        item_id: itemId,
        value: currentValue,
      },
    ]
  }
  // For updates, caller must check if value changed separately
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
    is_thumbnail: boolean
  }>
  valueHistory: Array<{
    item_id: string
    value: number
    recorded_at?: string
  }>
  tags: Array<{ item_id: string; tag_id: string }>
  itemIdsToDeletePhotos: string[]
  itemIdsToDeleteTags: string[]
}

interface ItemWithId {
  itemId: string
  photos?: { url: string; storage_path?: string | null; is_thumbnail: boolean }[]
  tagIds?: string[]
  valueHistory?: { value: number; recorded_at: string }[]
  currentValue?: number | null
}

function buildRelatedData(
  items: ItemWithId[],
  validTagIds: Set<string>,
  isUpdate: boolean,
  latestValueMap?: Map<string, number | null>
): RelatedData {
  const result: RelatedData = {
    photos: [],
    valueHistory: [],
    tags: [],
    itemIdsToDeletePhotos: [],
    itemIdsToDeleteTags: [],
  }

  for (const item of items) {
    // Build photos
    const photosData = buildPhotosInsertData(item.itemId, item.photos ?? [])
    result.photos.push(...photosData)
    if (isUpdate && (photosData.length > 0 || (item.photos && item.photos.length === 0))) {
      result.itemIdsToDeletePhotos.push(item.itemId)
    }

    // Build value_history
    let valueHistoryData = buildValueHistoryInsertData(
      item.itemId,
      item.valueHistory,
      item.currentValue,
      isUpdate
    )

    // For updates, check if value changed
    if (isUpdate && valueHistoryData.length === 0 && latestValueMap) {
      const latestValue = latestValueMap.get(item.itemId) ?? null
      const currentVal = item.currentValue ?? null
      const valueDiffersFromLatest =
        (latestValue === null) !== (currentVal === null) ||
        (latestValue !== null &&
          currentVal !== null &&
          Math.abs(latestValue - currentVal) >= 1e-6)

      if (valueDiffersFromLatest) {
        valueHistoryData = [
          {
            item_id: item.itemId,
            value: item.currentValue ?? 0,
          },
        ]
      }
    }

    result.valueHistory.push(...valueHistoryData)

    // Build tags
    const tagsData = buildItemTagsInsertData(item.itemId, item.tagIds ?? [], validTagIds)
    result.tags.push(...tagsData)
    if (isUpdate && (tagsData.length > 0 || (item.tagIds && item.tagIds.length === 0))) {
      result.itemIdsToDeleteTags.push(item.itemId)
    }
  }

  return result
}

/**
 * Fetch latest value_history records for items to detect value changes.
 */
async function fetchLatestValues(
  supabase: Supabase,
  itemIds: string[]
): Promise<Map<string, number | null>> {
  const { data: latestRecords, error: latestError } = await supabase
    .from("value_history")
    .select("item_id, value")
    .in("item_id", itemIds)
    .order("recorded_at", { ascending: false })

  if (latestError) throw latestError

  const latestValueMap = new Map<string, number | null>()
  const seenItems = new Set<string>()
  for (const record of latestRecords ?? []) {
    if (!seenItems.has(record.item_id)) {
      latestValueMap.set(record.item_id, record.value != null ? Number(record.value) : null)
      seenItems.add(record.item_id)
    }
  }
  return latestValueMap
}

/**
 * Insert related data (photos, value_history, tags) with optional deletion for updates.
 */
async function insertRelatedData(
  supabase: Supabase,
  data: RelatedData,
  operations: string[],
  isUpdate: boolean
): Promise<void> {
  // Delete existing data for updates
  if (isUpdate) {
    if (data.itemIdsToDeletePhotos.length > 0) {
      const { error: deleteError } = await supabase
        .from("photos")
        .delete()
        .in("item_id", data.itemIdsToDeletePhotos)
      if (deleteError) throw deleteError
      operations.push(`deleted existing photos for ${data.itemIdsToDeletePhotos.length} item(s)`)
    }

    if (data.itemIdsToDeleteTags.length > 0) {
      const { error: deleteTagsError } = await supabase
        .from("item_tags")
        .delete()
        .in("item_id", data.itemIdsToDeleteTags)
      if (deleteTagsError) throw deleteTagsError
      operations.push(`deleted existing tags for ${data.itemIdsToDeleteTags.length} item(s)`)
    }
  }

  // Insert new data
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
  creates: Array<{
    itemData: Record<string, unknown>
    photos?: { url: string; storage_path?: string | null; is_thumbnail: boolean }[]
    tagIds?: string[]
    valueHistory?: { value: number; recorded_at: string }[]
    currentValue?: number | null
  }>,
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

  if (itemsError) throw itemsError
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

  const relatedData = buildRelatedData(itemsWithIds, validTagIds, false)
  await insertRelatedData(supabase, relatedData, operations, false)

  return createdIds
}

/**
 * Process updates: update items and their related data.
 */
async function processUpdates(
  supabase: Supabase,
  userId: string,
  updates: Array<{
    itemId: string
    itemData: Record<string, unknown>
    photos?: { url: string; storage_path?: string | null; is_thumbnail: boolean }[]
    tagIds?: string[]
    valueHistory?: { value: number; recorded_at: string }[]
    currentValue?: number | null
  }>,
  operations: string[]
): Promise<string[]> {
  // Validate tags
  const validTagIds = await collectAndValidateTags(supabase, userId, updates)
  if (validTagIds.size > 0) {
    operations.push(`validated ${validTagIds.size} unique tag(s)`)
  }

  const updateItemIds = updates.map((item) => item.itemId)

  // Fetch latest values to detect changes
  const latestValueMap = await fetchLatestValues(supabase, updateItemIds)

  // Update items. Has to iterate through each, making multiple calls.
  // But user has no way of prompting updating multiple items at once client-side anyway.
  for (const update of updates) {
    const { error } = await supabase
      .from("items")
      .update(update.itemData)
      .eq("id", update.itemId)
      .eq("user_id", userId)
    if (error) throw error
  }

  operations.push(`updated ${updateItemIds.length} item(s)`)

  // Build related data
  const itemsWithIds: ItemWithId[] = updates.map((item) => ({
    itemId: item.itemId,
    photos: item.photos,
    tagIds: item.tagIds,
    valueHistory: item.valueHistory,
    currentValue: item.currentValue,
  }))

  const relatedData = buildRelatedData(itemsWithIds, validTagIds, true, latestValueMap)
  await insertRelatedData(supabase, relatedData, operations, true)

  return updateItemIds
}

/**
 * Create or update items (unified function for single or batch).
 * Handles both creates and updates. Returns array of item IDs and operations.
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

  // Separate items into creates and updates
  const creates: Array<{
    itemData: Record<string, unknown>
    photos?: { url: string; storage_path?: string | null; is_thumbnail: boolean }[]
    tagIds?: string[]
    valueHistory?: { value: number; recorded_at: string }[]
    currentValue?: number | null
  }> = []
  const updates: Array<{
    itemId: string
    itemData: Record<string, unknown>
    photos?: { url: string; storage_path?: string | null; is_thumbnail: boolean }[]
    tagIds?: string[]
    valueHistory?: { value: number; recorded_at: string }[]
    currentValue?: number | null
  }> = []

  for (const item of items) {
    if (item.isUpdate && item.itemId) {
      updates.push({
        itemId: item.itemId,
        itemData: item.itemData,
        photos: item.photos,
        tagIds: item.tagIds,
        valueHistory: item.valueHistory,
        currentValue: item.currentValue,
      })
    } else {
      creates.push({
        itemData: item.itemData,
        photos: item.photos,
        tagIds: item.tagIds,
        valueHistory: item.valueHistory,
        currentValue: item.currentValue,
      })
    }
  }

  const itemIds: string[] = []

  // Process creates
  if (creates.length > 0) {
    const createdIds = await processCreates(supabase, userId, creates, operations)
    itemIds.push(...createdIds)
  }

  // Process updates
  if (updates.length > 0) {
    const updatedIds = await processUpdates(supabase, userId, updates, operations)
    itemIds.push(...updatedIds)
  }

  return { itemIds, operations }
}

/**
 * Create or update a single item with photos, tags, and value_history.
 * Returns item ID and list of operations performed.
 */
export async function createItem({
  supabase,
  userId,
  itemData,
  photos = [],
  tagIds = [],
  valueHistory,
  currentValue,
  isUpdate = false,
  itemId,
}: CreateItemParams): Promise<CreateItemResult> {
  const result = await createItems({
    supabase,
    userId,
    items: [
      {
        itemData,
        photos,
        tagIds,
        valueHistory,
        currentValue,
        isUpdate,
        itemId,
      },
    ],
  })

  return {
    itemId: result.itemIds[0]!,
    operations: result.operations,
  }
}

/**
 * Legacy wrapper: Create one collection item from copy payload (e.g. for paste).
 * Maintains backward compatibility.
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

  const result = await createItem({
    supabase,
    userId,
    itemData,
    photos: payload.photos,
    tagIds: payload.tag_ids,
    valueHistory: payload.value_history,
    currentValue: payload.current_value,
  })

  return result.itemId
}
