import type { Box, Item, Tag } from "@/lib/types"
import {
  DEMO_COLLECTION_ITEM_SPECS,
  DEMO_SKELETON_TAG_UUIDS,
  DEMO_SKELETON_USER_ID,
  DEMO_TAG_SPECS,
  DEMO_BOX_ROWS,
  DEMO_PLACEHOLDER_PRIMARY,
  DEMO_WISHLIST_ITEM_SPECS,
} from "@/lib/demo/demo-seed-data"

const nowIso = "2026-01-12T10:00:00.000Z"

/**
 * Skeleton `Tag` rows for boneyard — IDs are preview-only.
 * DB seeding uses `DEMO_TAG_SPECS` and creates real tags per user at runtime.
 */
export const demoTags: Tag[] = DEMO_TAG_SPECS.map((spec, i) => ({
  id: DEMO_SKELETON_TAG_UUIDS[i]!,
  user_id: DEMO_SKELETON_USER_ID,
  name: spec.name,
  color: spec.color,
  created_at: nowIso,
  updated_at: nowIso,
}))

const tagByName = new Map(demoTags.map((t) => [t.name, t]))

/** Stable preview UUIDs — must stay in sync with app/boneyard-preview and bones. */
const COLLECTION_ITEM_IDS = [
  "33333333-3333-3333-3333-333333333301",
  "33333333-3333-3333-3333-333333333302",
  "33333333-3333-3333-3333-333333333303",
  "33333333-3333-3333-3333-333333333304",
] as const

const WISHLIST_ITEM_IDS = [
  "44444444-4444-4444-4444-444444444401",
  "44444444-4444-4444-4444-444444444402",
  "44444444-4444-4444-4444-444444444403",
] as const

export const BOX_SKELETON_FIXTURES: Box[] = DEMO_BOX_ROWS.map((row) => ({
  id: row.skeletonId,
  user_id: DEMO_SKELETON_USER_ID,
  parent_box_id: undefined,
  name: row.name,
  description: row.description,
  is_public: false,
  position: row.position,
  created_at: nowIso,
  updated_at: nowIso,
}))

export const COLLECTION_ITEM_SKELETON_FIXTURES: Item[] = DEMO_COLLECTION_ITEM_SPECS.map(
  (spec, i) => ({
    id: COLLECTION_ITEM_IDS[i]!,
    box_id: spec.skeletonBoxId,
    wishlist_target_box_id: null,
    user_id: DEMO_SKELETON_USER_ID,
    name: spec.name,
    description: spec.description,
    thumbnail_url: DEMO_PLACEHOLDER_PRIMARY,
    current_value: spec.current_value,
    acquisition_date: spec.acquisition_date,
    acquisition_price: spec.acquisition_price,
    is_wishlist: false,
    position: spec.position,
    created_at: nowIso,
    updated_at: nowIso,
    tags: spec.tagNames
      .map((n) => tagByName.get(n))
      .filter((t): t is Tag => t != null),
  })
)

export const WISHLIST_ITEM_SKELETON_FIXTURES: Item[] = DEMO_WISHLIST_ITEM_SPECS.map(
  (spec, i) => ({
    id: WISHLIST_ITEM_IDS[i]!,
    box_id: null,
    wishlist_target_box_id: spec.skeletonTargetBoxId,
    user_id: DEMO_SKELETON_USER_ID,
    name: spec.name,
    description: spec.description,
    thumbnail_url: DEMO_PLACEHOLDER_PRIMARY,
    current_value: undefined,
    acquisition_date: undefined,
    acquisition_price: undefined,
    is_wishlist: true,
    expected_price: spec.expected_price,
    position: spec.position,
    created_at: nowIso,
    updated_at: nowIso,
    tags: spec.tagNames
      .map((n) => tagByName.get(n))
      .filter((t): t is Tag => t != null),
  })
)
