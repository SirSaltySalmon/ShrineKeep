/** Draggable id prefix for box cards (`box-drag-<boxId>`). Item cards use `item-<itemId>`. */
export const BOX_DRAG_ID_PREFIX = "box-drag-"

/** True while the active draggable is a box card rather than an item card. */
export function isBoxDragId(activeDragId: string | null | undefined): boolean {
  return activeDragId?.startsWith(BOX_DRAG_ID_PREFIX) ?? false
}

/**
 * Whether a box (as a card or a breadcrumb) must refuse the drag in progress: it is the box
 * being dragged, or boxes are being moved and it is part of the selection. Mirrors the
 * guards in `useDashboardDnd().handleDragEnd`. False when nothing is being dragged.
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
