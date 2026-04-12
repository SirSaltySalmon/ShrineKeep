import type { BoxCopyPayload } from "@/lib/types"
import {
  DEMO_BOX_ROWS,
  DEMO_COLLECTION_ITEM_SPECS,
  DEMO_WISHLIST_ITEM_SPECS,
  collectionItemToCopyPayload,
  wishlistItemToCopyPayload,
  type DemoSkeletonBoxId,
} from "@/lib/demo/demo-seed-data"

/**
 * Build four root-level box trees for paste_box_trees_atomic (same shape as copy/paste).
 */
export function buildDemoBoxCopyPayloads(
  tagIdsByName: Map<string, string>
): BoxCopyPayload[] {
  return DEMO_BOX_ROWS.map((box) => {
    const sid = box.skeletonId as DemoSkeletonBoxId
    const items = DEMO_COLLECTION_ITEM_SPECS.filter((s) => s.skeletonBoxId === sid)
      .sort((a, b) => a.position - b.position)
      .map((s) => collectionItemToCopyPayload(s, tagIdsByName))
    const wishlistItems = DEMO_WISHLIST_ITEM_SPECS.filter(
      (s) => s.skeletonTargetBoxId === sid
    )
      .sort((a, b) => a.position - b.position)
      .map((s) => wishlistItemToCopyPayload(s, tagIdsByName))
    return {
      name: box.name,
      description: box.description,
      children: [],
      items,
      wishlistItems,
    }
  })
}
