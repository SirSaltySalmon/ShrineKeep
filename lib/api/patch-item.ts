import type { createSupabaseServerClient } from "@/lib/supabase/server"
import { validateTags } from "./validation"
import { deletePhotoRowsAndUnreferencedStorage } from "./photo-storage"
import type { ItemPatch, ItemPhotoOps } from "@/lib/item-patch"

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

export class ItemNotFoundError extends Error {
  constructor() {
    super("Item not found")
    this.name = "ItemNotFoundError"
  }
}

const SCALAR_KEYS = [
  "name",
  "description",
  "current_value",
  "acquisition_date",
  "acquisition_price",
  "expected_price",
  "thumbnail_url",
  "box_id",
  "wishlist_target_box_id",
  "is_wishlist",
] as const

function hasPhotoWork(photos: ItemPhotoOps | undefined): boolean {
  if (!photos) return false
  return (
    (photos.create?.length ?? 0) > 0 ||
    (photos.update?.length ?? 0) > 0 ||
    (photos.delete?.length ?? 0) > 0
  )
}

async function fetchLatestValue(
  supabase: Supabase,
  itemId: string
): Promise<number | null> {
  const { data, error } = await supabase
    .from("value_history")
    .select("value")
    .eq("item_id", itemId)
    .order("recorded_at", { ascending: false })
    .limit(1)

  if (error) throw error
  const value = data?.[0]?.value
  return value != null ? Number(value) : null
}

async function syncItemThumbnail(supabase: Supabase, itemId: string): Promise<void> {
  const { data: remaining, error } = await supabase
    .from("photos")
    .select("id, url, is_thumbnail")
    .eq("item_id", itemId)

  if (error) throw error

  const photos = remaining ?? []
  const thumbs = photos.filter((photo) => photo.is_thumbnail)
  let thumb = thumbs[0] ?? null

  if (thumbs.length > 1) {
    const extras = thumbs.slice(1)
    const { error: unsetError } = await supabase
      .from("photos")
      .update({ is_thumbnail: false })
      .in(
        "id",
        extras.map((photo) => photo.id)
      )
    if (unsetError) throw unsetError
  }

  if (!thumb && photos[0]) {
    const { error: setError } = await supabase
      .from("photos")
      .update({ is_thumbnail: true })
      .eq("id", photos[0].id)
    if (setError) throw setError
    thumb = photos[0]
  }

  const { error: itemError } = await supabase
    .from("items")
    .update({ thumbnail_url: thumb?.url ?? null })
    .eq("id", itemId)
  if (itemError) throw itemError
}

async function applyPhotoOps(
  supabase: Supabase,
  userId: string,
  itemId: string,
  photos: ItemPhotoOps,
  operations: string[]
): Promise<void> {
  const deleteIds = Array.from(new Set((photos.delete ?? []).filter(Boolean)))
  if (deleteIds.length > 0) {
    const { data: rows, error } = await supabase
      .from("photos")
      .select("id, storage_path")
      .eq("item_id", itemId)
      .in("id", deleteIds)

    if (error) throw error

    const result = await deletePhotoRowsAndUnreferencedStorage(supabase, userId, rows ?? [])
    operations.push(`deleted ${result.deletedCount} photo(s)`)
  }

  for (const update of photos.update ?? []) {
    const fields: Record<string, unknown> = {}
    if (update.is_thumbnail !== undefined) fields.is_thumbnail = update.is_thumbnail
    if (update.url !== undefined) fields.url = update.url
    if (update.storage_path !== undefined) fields.storage_path = update.storage_path ?? null
    if (Object.keys(fields).length === 0) continue

    const { error } = await supabase
      .from("photos")
      .update(fields)
      .eq("id", update.id)
      .eq("item_id", itemId)
    if (error) throw error
  }
  if ((photos.update?.length ?? 0) > 0) {
    operations.push(`updated ${photos.update!.length} photo(s)`)
  }

  const creates = photos.create ?? []
  if (creates.length > 0) {
    const { error } = await supabase.from("photos").insert(
      creates.map((photo) => ({
        item_id: itemId,
        url: photo.url,
        storage_path: photo.storage_path ?? null,
        is_thumbnail: photo.is_thumbnail,
      }))
    )
    if (error) throw error
    operations.push(`inserted ${creates.length} photo(s)`)
  }

  await syncItemThumbnail(supabase, itemId)
}

async function applyTagSetDiff(
  supabase: Supabase,
  userId: string,
  itemId: string,
  desiredTagIds: string[],
  operations: string[]
): Promise<void> {
  const { data: currentRows, error: currentError } = await supabase
    .from("item_tags")
    .select("tag_id")
    .eq("item_id", itemId)
  if (currentError) throw currentError

  const current = new Set((currentRows ?? []).map((row) => row.tag_id))
  const desired = new Set(desiredTagIds)
  const toAdd = Array.from(desired).filter((id) => !current.has(id))
  const toRemove = Array.from(current).filter((id) => !desired.has(id))

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("item_tags")
      .delete()
      .eq("item_id", itemId)
      .in("tag_id", toRemove)
    if (error) throw error
    operations.push(`removed ${toRemove.length} tag(s)`)
  }

  if (toAdd.length === 0) return

  const validTagIds = await validateTags(supabase, userId, toAdd)
  operations.push(`validated ${validTagIds.size} unique tag(s)`)
  const insertRows = Array.from(validTagIds).map((tag_id) => ({ item_id: itemId, tag_id }))
  if (insertRows.length === 0) return

  const { error } = await supabase.from("item_tags").insert(insertRows)
  if (error) throw error
  operations.push(`inserted ${insertRows.length} item_tag association(s)`)
}

export async function applyItemPatch({
  supabase,
  userId,
  patch,
}: {
  supabase: Supabase
  userId: string
  patch: ItemPatch
}): Promise<{ itemId: string; operations: string[] }> {
  const operations: string[] = []
  const itemId = patch.id

  const { data: item, error: itemError } = await supabase
    .from("items")
    .select("id")
    .eq("id", itemId)
    .eq("user_id", userId)
    .maybeSingle()

  if (itemError) throw itemError
  if (!item) throw new ItemNotFoundError()

  const scalarUpdate: Record<string, unknown> = {}
  for (const key of SCALAR_KEYS) {
    if (patch[key] !== undefined) {
      if (key === "name") {
        const name = typeof patch.name === "string" ? patch.name.trim() : ""
        if (!name) throw new Error("Name is required")
        scalarUpdate.name = name
      } else {
        scalarUpdate[key] = patch[key]
      }
    }
  }

  if (Object.keys(scalarUpdate).length > 0) {
    const { error } = await supabase
      .from("items")
      .update(scalarUpdate)
      .eq("id", itemId)
      .eq("user_id", userId)
    if (error) throw error
    operations.push("updated item scalars")
  }

  if (hasPhotoWork(patch.photos)) {
    await applyPhotoOps(supabase, userId, itemId, patch.photos!, operations)
  }

  if (patch.tag_ids !== undefined) {
    await applyTagSetDiff(supabase, userId, itemId, patch.tag_ids, operations)
  }

  if (patch.current_value !== undefined) {
    const latestValue = await fetchLatestValue(supabase, itemId)
    const currentVal = patch.current_value ?? null
    const valueDiffersFromLatest =
      (latestValue === null) !== (currentVal === null) ||
      (latestValue !== null &&
        currentVal !== null &&
        Math.abs(latestValue - currentVal) >= 1e-6)

    if (valueDiffersFromLatest) {
      const { error } = await supabase.from("value_history").insert({
        item_id: itemId,
        value: currentVal ?? 0,
      })
      if (error) throw error
      operations.push("inserted 1 value_history record(s)")
    }
  }

  if (operations.length === 0) {
    operations.push("no changes")
  }

  return { itemId, operations }
}
