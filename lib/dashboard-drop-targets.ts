/** Draggable id prefix for item cards (`item-<itemId>`). */
export const ITEM_DRAG_ID_PREFIX = "item-"

/** Draggable id prefix for box cards (`box-drag-<boxId>`). */
export const BOX_DRAG_ID_PREFIX = "box-drag-"

/** Droppable id prefixes of the two places that stand for a box: its card and its breadcrumb. */
export const BOX_DROP_ID_PREFIX = "box-"
export const BREADCRUMB_BOX_DROP_ID_PREFIX = "breadcrumb-box-"

/** True while the active draggable is a box card rather than an item card. */
export function isBoxDragId(activeDragId: string | null | undefined): boolean {
  return activeDragId?.startsWith(BOX_DRAG_ID_PREFIX) ?? false
}

/** The box a box-card or breadcrumb droppable stands for. Undefined for any other droppable id. */
export function getDropTargetBoxId(overId: string): string | undefined {
  for (const prefix of [BREADCRUMB_BOX_DROP_ID_PREFIX, BOX_DROP_ID_PREFIX]) {
    if (overId.startsWith(prefix)) return overId.slice(prefix.length)
  }
  return undefined
}

/**
 * Whether a box (as a card or a breadcrumb) must refuse the drag in progress: it is the box
 * being dragged, or boxes are being moved and it is part of the selection. False when nothing
 * is being dragged. `useDashboardDnd().handleDragEnd` rejects a drop with this same function,
 * so a target that shows the cue is one that accepts the drop.
 */
export function isBoxDropBlocked(
  activeDragId: string | null | undefined,
  boxId: string,
  boxSelected: boolean,
): boolean {
  if (activeDragId == null) return false
  if (activeDragId === BOX_DRAG_ID_PREFIX + boxId) return true
  return isBoxDragId(activeDragId) && boxSelected
}

/** Whether a box should advertise itself as a drop target for the drag in progress. */
export function shouldCueBoxDrop(
  activeDragId: string | null | undefined,
  boxId: string,
  boxSelected: boolean,
): boolean {
  return activeDragId != null && !isBoxDropBlocked(activeDragId, boxId, boxSelected)
}
