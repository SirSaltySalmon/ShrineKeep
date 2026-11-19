import type { createSupabaseServerClient } from "@/lib/supabase/server"

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

/** Reads a JSON request body; null when it is not valid JSON or not a JSON object. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json()
    return typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

const ITEM_STRING_FIELDS = [
  "description",
  "acquisition_date",
  "thumbnail_url",
  "box_id",
  "wishlist_target_box_id",
] as const
const ITEM_NUMBER_FIELDS = ["current_value", "acquisition_price", "expected_price"] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * First type problem among the scalar item fields of a create or patch body, or null.
 * Only fields that are present are checked; which ones are required is the route's call.
 */
export function itemScalarTypeError(fields: Record<string, unknown>): string | null {
  if (fields.name !== undefined && typeof fields.name !== "string") {
    return "name must be a string"
  }
  for (const key of ITEM_STRING_FIELDS) {
    const value = fields[key]
    if (value != null && typeof value !== "string") return `${key} must be a string or null`
  }
  for (const key of ITEM_NUMBER_FIELDS) {
    const value = fields[key]
    // JSON.parse turns an out-of-range literal such as 1e999 into Infinity.
    if (value != null && !(typeof value === "number" && Number.isFinite(value))) {
      return `${key} must be a number or null`
    }
  }
  if (fields.is_wishlist !== undefined && typeof fields.is_wishlist !== "boolean") {
    return "is_wishlist must be a boolean"
  }
  return null
}

/**
 * First type problem in a create body (POST /api/items, pasted item payloads), or null:
 * the scalars above plus the photo, tag and value-history lists a create carries.
 */
export function itemCreateTypeError(fields: Record<string, unknown>): string | null {
  const scalarError = itemScalarTypeError(fields)
  if (scalarError) return scalarError

  const { photos, tag_ids: tagIds, value_history: valueHistory } = fields
  if (photos != null) {
    const valid =
      Array.isArray(photos) &&
      photos.every(
        (photo) =>
          isRecord(photo) &&
          typeof photo.url === "string" &&
          (photo.is_thumbnail === undefined || typeof photo.is_thumbnail === "boolean")
      )
    if (!valid) return "photos must be an array of { url, is_thumbnail }"
  }
  if (tagIds != null) {
    const valid = Array.isArray(tagIds) && tagIds.every((id) => typeof id === "string")
    if (!valid) return "tag_ids must be an array of strings"
  }
  if (valueHistory != null) {
    const valid =
      Array.isArray(valueHistory) &&
      valueHistory.every(
        (entry) =>
          isRecord(entry) &&
          typeof entry.value === "number" &&
          Number.isFinite(entry.value) &&
          typeof entry.recorded_at === "string"
      )
    if (!valid) return "value_history must be an array of { value, recorded_at }"
  }
  return null
}

/**
 * Validate tag IDs belong to user. Returns Set of valid tag IDs.
 * Required to filter invalid tag IDs before inserting item_tags (prevents foreign key errors).
 */
export async function validateTags(
  supabase: Supabase,
  userId: string,
  tagIds: string[]
): Promise<Set<string>> {
  if (tagIds.length === 0) return new Set()

  const { data: userTags, error } = await supabase
    .from("tags")
    .select("id")
    .eq("user_id", userId)
    .in("id", tagIds)

  if (error) throw error

  return new Set((userTags ?? []).map((t) => t.id))
}

/**
 * Validate item IDs belong to user. Returns Set of valid item IDs.
 * Optional but recommended for batch operations: Provides better error messages
 * and allows partial failure handling.
 */
export async function validateItemsBelongToUser(
  supabase: Supabase,
  userId: string,
  itemIds: string[]
): Promise<Set<string>> {
  if (itemIds.length === 0) return new Set()

  const { data: items, error } = await supabase
    .from("items")
    .select("id")
    .in("id", itemIds)
    .eq("user_id", userId)

  if (error) throw error

  return new Set((items ?? []).map((item) => item.id))
}

/**
 * Validate box IDs belong to user. Returns Set of valid box IDs.
 * Optional but recommended for batch operations: Provides better error messages
 * and allows partial failure handling.
 */
export async function validateBoxesBelongToUser(
  supabase: Supabase,
  userId: string,
  boxIds: string[]
): Promise<Set<string>> {
  if (boxIds.length === 0) return new Set()

  const { data: boxes, error } = await supabase
    .from("boxes")
    .select("id")
    .in("id", boxIds)
    .eq("user_id", userId)

  if (error) throw error

  return new Set((boxes ?? []).map((box) => box.id))
}
