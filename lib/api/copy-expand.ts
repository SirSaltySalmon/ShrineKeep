import type { createSupabaseServerClient } from "@/lib/supabase/server"
import type { BoxCopyPayload, ItemCopyPayload } from "@/lib/types"
import { randomUUID } from "crypto"

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

export interface CopyPasteTarget {
  boxId: string | null
  isWishlist: boolean
  /**
   * When `boxId` is set: copy each item like its source — collection → `box_id`,
   * wishlist → `wishlist_target_box_id`. Used on the dashboard so one paste can
   * duplicate both tabs’ selections into the open box.
   */
  preserveItemKindsInBox?: boolean
}

export interface ExpandedItemCreateInput {
  name: string
  description?: string | null
  current_value?: number | null
  acquisition_date?: string | null
  acquisition_price?: number | null
  expected_price?: number | null
  thumbnail_url?: string | null
  box_id?: string | null
  wishlist_target_box_id?: string | null
  is_wishlist: boolean
  photos: { url: string; storage_path?: string; is_thumbnail: boolean }[]
  tag_ids?: string[]
  value_history?: { value: number; recorded_at: string }[]
}

interface SourceItemRow {
  id: string
  user_id: string
  name: string
  description: string | null
  current_value: number | null
  acquisition_date: string | null
  acquisition_price: number | null
  expected_price: number | null
  thumbnail_url: string | null
  is_wishlist: boolean
  wishlist_target_box_id: string | null
  photos?: { url: string; storage_path?: string | null; is_thumbnail: boolean }[]
  item_tags?: Array<{ tag?: { id?: string } }>
}

interface SourceBoxRow {
  id: string
  parent_box_id: string | null
  name: string
  description: string | null
  position: number
}

interface SourceTreeItemRow extends SourceItemRow {
  box_id: string | null
  position: number
}

export interface AtomicBoxNodeInput {
  temp_id: string
  parent_temp_id: string | null
  name: string
  description: string | null
  position: number
}

export interface AtomicBoxItemInput {
  box_temp_id: string
  position: number
  name: string
  description: string | null
  current_value: number | null
  acquisition_date: string | null
  acquisition_price: number | null
  thumbnail_url: string | null
  photos: { url: string; storage_path?: string; is_thumbnail: boolean }[]
  tag_ids: string[]
  value_history?: { value: number; recorded_at: string }[]
}

export interface AtomicWishlistItemInput {
  box_temp_id: string
  position: number
  name: string
  description: string | null
  current_value: number | null
  expected_price: number | null
  thumbnail_url: string | null
  photos: { url: string; storage_path?: string; is_thumbnail: boolean }[]
  tag_ids: string[]
  value_history?: { value: number; recorded_at: string }[]
}

function getSourcePrice(item: SourceItemRow): number | null {
  if (item.is_wishlist) return item.expected_price ?? null
  return item.acquisition_price ?? null
}

async function fetchSubtreeBoxIds(
  supabase: Supabase,
  userId: string,
  rootIds: string[]
): Promise<string[]> {
  const allBoxIds = new Set<string>(rootIds)
  let currentLevel = [...rootIds]

  while (currentLevel.length > 0) {
    const { data: children, error } = await supabase
      .from("boxes")
      .select("id")
      .in("parent_box_id", currentLevel)
      .eq("user_id", userId)
    if (error) throw error
    if (!children?.length) break
    currentLevel = children.map((c) => c.id)
    currentLevel.forEach((id) => allBoxIds.add(id))
  }

  return Array.from(allBoxIds)
}

function buildItemCopyPayloadFromRow(
  item: SourceItemRow,
  valueHistory: { value: number; recorded_at: string }[]
): ItemCopyPayload {
  const photos = (item.photos ?? []).map((p) => ({
    url: p.url,
    storage_path: p.storage_path ?? undefined,
    is_thumbnail: p.is_thumbnail,
  }))
  const tagIds = (item.item_tags ?? [])
    .map((it) => it.tag?.id)
    .filter((id): id is string => typeof id === "string")

  return {
    name: item.name,
    description: item.description ?? null,
    current_value: item.current_value ?? null,
    acquisition_date: item.acquisition_date ?? null,
    acquisition_price: item.acquisition_price ?? null,
    expected_price: item.expected_price ?? null,
    thumbnail_url: item.thumbnail_url ?? null,
    is_wishlist: item.is_wishlist,
    wishlist_target_box_id: item.wishlist_target_box_id ?? null,
    photos,
    tag_ids: tagIds,
    value_history: valueHistory,
  }
}

/**
 * Expand source item references to full create inputs for batch paste.
 * Keeps caller-provided order for deterministic results.
 */
export async function expandItemRefsToCreateInputs(
  supabase: Supabase,
  userId: string,
  sourceItemIds: string[],
  target: CopyPasteTarget
): Promise<ExpandedItemCreateInput[]> {
  if (sourceItemIds.length === 0) return []
  const dedupedIds = Array.from(new Set(sourceItemIds))

  const { data: sourceItems, error: itemsError } = await supabase
    .from("items")
    .select(`
      id,
      user_id,
      name,
      description,
      current_value,
      acquisition_date,
      acquisition_price,
      expected_price,
      thumbnail_url,
      is_wishlist,
      wishlist_target_box_id,
      photos (url, storage_path, is_thumbnail),
      item_tags (
        tag:tags (id)
      )
    `)
    .in("id", dedupedIds)
    .eq("user_id", userId)

  if (itemsError) throw itemsError

  const rows = (sourceItems ?? []) as SourceItemRow[]
  if (rows.length !== dedupedIds.length) {
    throw new Error("Some source items could not be found")
  }

  const { data: valueHistory, error: historyError } = await supabase
    .from("value_history")
    .select("item_id, value, recorded_at")
    .in("item_id", dedupedIds)
    .order("recorded_at", { ascending: true })

  if (historyError) throw historyError

  const historyByItem = new Map<string, Array<{ value: number; recorded_at: string }>>()
  for (const row of valueHistory ?? []) {
    if (!historyByItem.has(row.item_id)) {
      historyByItem.set(row.item_id, [])
    }
    historyByItem.get(row.item_id)!.push({
      value: Number(row.value),
      recorded_at: row.recorded_at,
    })
  }

  const itemById = new Map(rows.map((row) => [row.id, row]))
  const orderedRows = dedupedIds.map((id) => itemById.get(id)).filter((v): v is SourceItemRow => !!v)

  const wishlistPagePaste =
    target.isWishlist &&
    (target.boxId == null || target.boxId === "") &&
    target.preserveItemKindsInBox !== true

  if (wishlistPagePaste) {
    for (const row of orderedRows) {
      if (!row.is_wishlist) {
        throw new Error("Only wishlist items can be pasted on the wishlist page")
      }
    }
  }

  return orderedRows.map((item) => {
    const sourcePrice = getSourcePrice(item)
    const photos = (item.photos ?? []).map((p) => ({
      url: p.url,
      storage_path: p.storage_path ?? undefined,
      is_thumbnail: p.is_thumbnail,
    }))
    const tagIds = (item.item_tags ?? [])
      .map((it) => it.tag?.id)
      .filter((id): id is string => typeof id === "string")

    const preserve = target.preserveItemKindsInBox === true && target.boxId != null
    if (preserve) {
      if (item.is_wishlist) {
        return {
          name: item.name,
          description: item.description ?? null,
          current_value: item.current_value ?? null,
          acquisition_date: null,
          acquisition_price: null,
          expected_price: sourcePrice,
          thumbnail_url: item.thumbnail_url ?? null,
          box_id: null,
          wishlist_target_box_id: target.boxId,
          is_wishlist: true,
          photos,
          tag_ids: tagIds,
          value_history: historyByItem.get(item.id) ?? [],
        }
      }
      return {
        name: item.name,
        description: item.description ?? null,
        current_value: item.current_value ?? null,
        acquisition_date: item.acquisition_date ?? null,
        acquisition_price: item.acquisition_price ?? sourcePrice,
        expected_price: null,
        thumbnail_url: item.thumbnail_url ?? null,
        box_id: target.boxId,
        wishlist_target_box_id: null,
        is_wishlist: false,
        photos,
        tag_ids: tagIds,
        value_history: historyByItem.get(item.id) ?? [],
      }
    }

    if (target.isWishlist) {
      const destBoxId = target.boxId
      return {
        name: item.name,
        description: item.description ?? null,
        current_value: item.current_value ?? null,
        acquisition_date: null,
        acquisition_price: null,
        expected_price: sourcePrice,
        thumbnail_url: item.thumbnail_url ?? null,
        box_id: null,
        wishlist_target_box_id:
          destBoxId ?? (item.is_wishlist ? (item.wishlist_target_box_id ?? null) : null),
        is_wishlist: true,
        photos,
        tag_ids: tagIds,
        value_history: historyByItem.get(item.id) ?? [],
      }
    }

    return {
      name: item.name,
      description: item.description ?? null,
      current_value: item.current_value ?? null,
      acquisition_date: item.is_wishlist ? null : (item.acquisition_date ?? null),
      acquisition_price: sourcePrice,
      expected_price: null,
      thumbnail_url: item.thumbnail_url ?? null,
      box_id: target.boxId,
      wishlist_target_box_id: null,
      is_wishlist: false,
      photos,
      tag_ids: tagIds,
      value_history: historyByItem.get(item.id) ?? [],
    }
  })
}

/**
 * Expand source root box references to BoxCopyPayload trees.
 * Preserves source box/item ordering via position.
 */
export async function expandBoxRefsToTrees(
  supabase: Supabase,
  userId: string,
  sourceRootBoxIds: string[]
): Promise<BoxCopyPayload[]> {
  if (sourceRootBoxIds.length === 0) return []
  const rootIds = Array.from(new Set(sourceRootBoxIds))
  const subtreeIds = await fetchSubtreeBoxIds(supabase, userId, rootIds)
  if (subtreeIds.length === 0) return []

  const { data: boxes, error: boxesError } = await supabase
    .from("boxes")
    .select("id, parent_box_id, name, description, position")
    .in("id", subtreeIds)
    .eq("user_id", userId)
  if (boxesError) throw boxesError

  const boxRows = (boxes ?? []) as SourceBoxRow[]
  const boxById = new Map(boxRows.map((box) => [box.id, box]))
  if (rootIds.some((id) => !boxById.has(id))) {
    throw new Error("Some source boxes could not be found")
  }

  const { data: items, error: itemsError } = await supabase
    .from("items")
    .select(`
      id,
      box_id,
      user_id,
      name,
      description,
      current_value,
      acquisition_date,
      acquisition_price,
      expected_price,
      thumbnail_url,
      is_wishlist,
      wishlist_target_box_id,
      position,
      photos (url, storage_path, is_thumbnail),
      item_tags (
        tag:tags (id)
      )
    `)
    .in("box_id", subtreeIds)
    .eq("user_id", userId)
    .eq("is_wishlist", false)
  if (itemsError) throw itemsError

  const { data: wishlistItems, error: wishlistItemsError } = await supabase
    .from("items")
    .select(`
      id,
      wishlist_target_box_id,
      user_id,
      name,
      description,
      current_value,
      acquisition_date,
      acquisition_price,
      expected_price,
      thumbnail_url,
      is_wishlist,
      position,
      photos (url, storage_path, is_thumbnail),
      item_tags (
        tag:tags (id)
      )
    `)
    .in("wishlist_target_box_id", subtreeIds)
    .eq("user_id", userId)
    .eq("is_wishlist", true)
  if (wishlistItemsError) throw wishlistItemsError

  const itemRows = (items ?? []) as SourceTreeItemRow[]
  const wishlistRows = (wishlistItems ?? []).map((row) => ({
    ...row,
    box_id: row.wishlist_target_box_id as string | null,
    wishlist_target_box_id: row.wishlist_target_box_id as string | null,
  })) as SourceTreeItemRow[]
  const itemIds = [...itemRows, ...wishlistRows].map((item) => item.id)
  const historyByItem = new Map<string, Array<{ value: number; recorded_at: string }>>()
  if (itemIds.length > 0) {
    const { data: valueHistory, error: historyError } = await supabase
      .from("value_history")
      .select("item_id, value, recorded_at")
      .in("item_id", itemIds)
      .order("recorded_at", { ascending: true })
    if (historyError) throw historyError

    for (const row of valueHistory ?? []) {
      if (!historyByItem.has(row.item_id)) {
        historyByItem.set(row.item_id, [])
      }
      historyByItem.get(row.item_id)!.push({
        value: Number(row.value),
        recorded_at: row.recorded_at,
      })
    }
  }

  const itemsByBox = new Map<string, SourceTreeItemRow[]>()
  for (const item of itemRows) {
    if (!item.box_id) continue
    if (!itemsByBox.has(item.box_id)) {
      itemsByBox.set(item.box_id, [])
    }
    itemsByBox.get(item.box_id)!.push(item)
  }
  Array.from(itemsByBox.values()).forEach((list: SourceTreeItemRow[]) => {
    list.sort((a: SourceTreeItemRow, b: SourceTreeItemRow) => (a.position ?? 0) - (b.position ?? 0))
  })

  const wishlistItemsByBox = new Map<string, SourceTreeItemRow[]>()
  for (const item of wishlistRows) {
    if (!item.box_id) continue
    if (!wishlistItemsByBox.has(item.box_id)) {
      wishlistItemsByBox.set(item.box_id, [])
    }
    wishlistItemsByBox.get(item.box_id)!.push(item)
  }
  Array.from(wishlistItemsByBox.values()).forEach((list: SourceTreeItemRow[]) => {
    list.sort((a: SourceTreeItemRow, b: SourceTreeItemRow) => (a.position ?? 0) - (b.position ?? 0))
  })

  const childrenByBox = new Map<string | null, SourceBoxRow[]>()
  for (const box of boxRows) {
    const key = box.parent_box_id ?? null
    if (!childrenByBox.has(key)) {
      childrenByBox.set(key, [])
    }
    childrenByBox.get(key)!.push(box)
  }
  Array.from(childrenByBox.values()).forEach((list: SourceBoxRow[]) => {
    list.sort((a: SourceBoxRow, b: SourceBoxRow) => (a.position ?? 0) - (b.position ?? 0))
  })

  const buildNode = (boxId: string): BoxCopyPayload => {
    const box = boxById.get(boxId)
    if (!box) return { name: "", description: null, children: [], items: [], wishlistItems: [] }
    const nodeItems = (itemsByBox.get(boxId) ?? []).map((item) =>
      buildItemCopyPayloadFromRow(item, historyByItem.get(item.id) ?? [])
    )
    const nodeWishlistItems = (wishlistItemsByBox.get(boxId) ?? []).map((item) =>
      buildItemCopyPayloadFromRow(item, historyByItem.get(item.id) ?? [])
    )
    const nodeChildren = (childrenByBox.get(boxId) ?? []).map((child) => buildNode(child.id))
    return {
      name: box.name,
      description: box.description ?? null,
      children: nodeChildren,
      items: nodeItems,
      wishlistItems: nodeWishlistItems,
    }
  }

  const orderedRoots = rootIds
    .map((id) => boxById.get(id))
    .filter((box): box is SourceBoxRow => !!box)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

  return orderedRoots.map((root) => buildNode(root.id))
}

/**
 * Count non-wishlist items in selected box subtrees.
 */
export async function countCollectionItemsInBoxSubtrees(
  supabase: Supabase,
  userId: string,
  sourceRootBoxIds: string[]
): Promise<number> {
  if (sourceRootBoxIds.length === 0) return 0
  const rootIds = Array.from(new Set(sourceRootBoxIds))
  const subtreeIds = await fetchSubtreeBoxIds(supabase, userId, rootIds)
  if (subtreeIds.length === 0) return 0

  const { count, error } = await supabase
    .from("items")
    .select("*", { count: "exact", head: true })
    .in("box_id", subtreeIds)
    .eq("user_id", userId)
    .eq("is_wishlist", false)
  if (error) throw error
  return count ?? 0
}

/**
 * Flatten BoxCopyPayload trees into RPC-friendly node/item arrays.
 */
export function flattenBoxCopyTreesForAtomicPaste(trees: BoxCopyPayload[]): {
  nodes: AtomicBoxNodeInput[]
  items: AtomicBoxItemInput[]
  wishlistItems: AtomicWishlistItemInput[]
} {
  const nodes: AtomicBoxNodeInput[] = []
  const items: AtomicBoxItemInput[] = []
  const wishlistItems: AtomicWishlistItemInput[] = []

  const walk = (node: BoxCopyPayload, parentTempId: string | null, position: number) => {
    const tempId = randomUUID()
    nodes.push({
      temp_id: tempId,
      parent_temp_id: parentTempId,
      name: node.name.trim(),
      description: node.description?.trim() || null,
      position,
    })
    node.items.forEach((item, itemPos) => {
      const thumbnailUrl =
        item.photos?.find((p) => p.is_thumbnail)?.url ?? item.thumbnail_url ?? null
      const sourcePrice = item.is_wishlist ? (item.expected_price ?? null) : (item.acquisition_price ?? null)
      const acquisitionDate = item.is_wishlist ? null : (item.acquisition_date ?? null)
      items.push({
        box_temp_id: tempId,
        position: itemPos,
        name: item.name.trim(),
        description: item.description?.trim() || null,
        current_value: item.current_value ?? null,
        acquisition_date: acquisitionDate,
        acquisition_price: sourcePrice,
        thumbnail_url: thumbnailUrl,
        photos: item.photos ?? [],
        tag_ids: item.tag_ids ?? [],
        value_history: item.value_history ?? [],
      })
    })
    ;(node.wishlistItems ?? []).forEach((item, itemPos) => {
      const thumbnailUrl =
        item.photos?.find((p) => p.is_thumbnail)?.url ?? item.thumbnail_url ?? null
      const sourcePrice = item.is_wishlist ? (item.expected_price ?? null) : (item.acquisition_price ?? null)
      wishlistItems.push({
        box_temp_id: tempId,
        position: itemPos,
        name: item.name.trim(),
        description: item.description?.trim() || null,
        current_value: item.current_value ?? null,
        expected_price: sourcePrice,
        thumbnail_url: thumbnailUrl,
        photos: item.photos ?? [],
        tag_ids: item.tag_ids ?? [],
        value_history: item.value_history ?? [],
      })
    })
    node.children.forEach((child, childPos) => walk(child, tempId, childPos))
  }

  trees.forEach((tree, rootPos) => walk(tree, null, rootPos))
  return { nodes, items, wishlistItems }
}
