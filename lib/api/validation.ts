import type { createSupabaseServerClient } from "@/lib/supabase/server"

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

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
