/**
 * Tree and drop rules for the landing page's mock dashboard
 * (`components/landing/mock-dashboard.tsx`). Same model as the real dashboard:
 * a box or an item lives in exactly one place, and totals roll up the subtree.
 */

export interface BoxNode {
  id: string
  /** `null` means the box sits at the root. */
  parentId: string | null
}

export interface PlacedItem {
  id: string
  /** The one place this item lives. `null` is the root (no box). */
  boxId: string | null
  wishlist?: boolean
}

/** A box id plus every box nested under it. */
export function subtreeIds(boxes: BoxNode[], rootId: string): Set<string> {
  const ids = new Set([rootId])
  let grew = true
  while (grew) {
    grew = false
    for (const box of boxes) {
      if (box.parentId && ids.has(box.parentId) && !ids.has(box.id)) {
        ids.add(box.id)
        grew = true
      }
    }
  }
  return ids
}

/** Owned items in a box and everything nested in it; `null` is the whole collection. */
export function ownedInSubtree<T extends PlacedItem>(items: T[], boxes: BoxNode[], boxId: string | null): T[] {
  const owned = items.filter((item) => !item.wishlist)
  if (boxId === null) return owned
  const ids = subtreeIds(boxes, boxId)
  return owned.filter((item) => item.boxId !== null && ids.has(item.boxId))
}

/** Root-first chain of boxes down to `boxId`. */
export function pathTo<T extends BoxNode>(boxes: T[], boxId: string | null): T[] {
  const path: T[] = []
  let current = boxes.find((box) => box.id === boxId)
  while (current) {
    path.unshift(current)
    const parentId: string | null = current.parentId
    current = boxes.find((box) => box.id === parentId)
  }
  return path
}

export type DragData = { kind: "item"; id: string } | { kind: "box"; id: string }

/** What a drop target stands for: a box (`null` is the root), or one level up from the open box. */
export type DropTarget = { to: "box"; boxId: string | null } | { to: "parent" }

/**
 * Where a drop moves the dragged item or box: `{ boxId }` (`null` is the root), or `null` when
 * the drop changes nothing or is not allowed.
 */
export function resolveDrop(
  drag: DragData,
  target: DropTarget,
  state: { boxes: BoxNode[]; items: PlacedItem[]; openBoxId: string | null }
): { boxId: string | null } | null {
  const { boxes, items, openBoxId } = state
  const boxId =
    target.to === "parent" ? (boxes.find((box) => box.id === openBoxId)?.parentId ?? null) : target.boxId

  if (drag.kind === "item") {
    const item = items.find((candidate) => candidate.id === drag.id)
    return item && item.boxId !== boxId ? { boxId } : null
  }

  const box = boxes.find((candidate) => candidate.id === drag.id)
  if (!box || box.parentId === boxId) return null
  // A box cannot be put inside itself or anything nested in it.
  if (boxId !== null && subtreeIds(boxes, box.id).has(boxId)) return null
  return { boxId }
}
