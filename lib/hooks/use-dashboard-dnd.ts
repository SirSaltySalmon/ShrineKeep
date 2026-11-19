"use client"

import { useState } from "react"
import { TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { NonTouchPointerSensor } from "@/lib/non-touch-pointer-sensor"
import { MOVE_TO_PARENT_ZONE_ID } from "@/components/move-to-parent-zone"
import { BREADCRUMB_ROOT_DROP_ID } from "@/components/breadcrumbs"
import {
  BOX_DRAG_ID_PREFIX,
  ITEM_DRAG_ID_PREFIX,
  getDropTargetBoxId,
  isBoxDragId,
  isBoxDropBlocked,
} from "@/lib/dashboard-drop-targets"
import type { Box, Item } from "@/lib/types"

type AffectedBoxInput = string | null | Array<string | null> | undefined

interface UseDashboardDndParams {
  currentBoxId: string | null
  currentBox: Box | null
  items: Item[]
  boxes: Box[]
  selectedItemIds: Set<string>
  selectedBoxIds: Set<string>
  loadItems: (affected?: AffectedBoxInput) => Promise<void>
  loadBoxes: (affected?: AffectedBoxInput) => Promise<void>
  bumpStatsRefreshKey: () => void
}

/** Reads the `error` of a failed move response; a body that is not JSON gives the fallback. */
async function moveErrorMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => ({}))
  return typeof body?.error === "string" ? body.error : fallback
}

/** A failed move leaves the cards where they were, so say why. A successful one needs no message. */
function alertMoveFailed(error: unknown) {
  alert(`Move failed: ${error instanceof Error ? error.message : String(error)}`)
}

export function useDashboardDnd({
  currentBoxId,
  currentBox,
  items,
  boxes,
  selectedItemIds,
  selectedBoxIds,
  loadItems,
  loadBoxes,
  bumpStatsRefreshKey,
}: UseDashboardDndParams) {
  const [dndMoveLoading, setDndMoveLoading] = useState(false)
  const [dndActiveId, setDndActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(NonTouchPointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    })
  )

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return

    const activeId = String(active.id)
    const overId = String(over.id)

    let targetParentBoxId: string | null
    if (overId === MOVE_TO_PARENT_ZONE_ID) {
      targetParentBoxId = currentBox?.parent_box_id ?? null
    } else if (overId === BREADCRUMB_ROOT_DROP_ID) {
      targetParentBoxId = null
    } else {
      const targetBoxId = getDropTargetBoxId(overId)
      if (targetBoxId === undefined) return
      targetParentBoxId = targetBoxId
    }

    // The rule the drop cues are drawn from: a box never takes itself or, while boxes are
    // being moved, another selected box.
    if (
      targetParentBoxId !== null &&
      isBoxDropBlocked(activeId, targetParentBoxId, selectedBoxIds.has(targetParentBoxId))
    ) {
      return
    }

    if (activeId.startsWith(ITEM_DRAG_ID_PREFIX)) {
      const itemId = activeId.slice(ITEM_DRAG_ID_PREFIX.length)
      const draggedItem = active.data.current?.item as Item | undefined
      if (!draggedItem) return

      const currentItemBoxId = draggedItem.box_id ?? null
      if (currentItemBoxId === targetParentBoxId) return

      const moveItemIds =
        selectedItemIds.has(itemId) && selectedItemIds.size > 0
          ? items
              .filter(
                (i) => selectedItemIds.has(i.id) && (i.box_id ?? null) === currentItemBoxId
              )
              .map((i) => i.id)
          : [itemId]

      if (moveItemIds.length === 0) return

      setDndMoveLoading(true)
      try {
        const res = await fetch("/api/items/move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemIds: moveItemIds, targetBoxId: targetParentBoxId }),
        })
        if (!res.ok) throw new Error(await moveErrorMessage(res, "Failed to move item"))
        await Promise.all([
          loadItems([currentItemBoxId, targetParentBoxId]),
          loadBoxes([currentBoxId]),
        ])
        bumpStatsRefreshKey()
      } catch (e) {
        console.error("Error moving item:", e)
        alertMoveFailed(e)
      } finally {
        setDndMoveLoading(false)
      }
      return
    }

    if (isBoxDragId(activeId)) {
      const boxId = activeId.slice(BOX_DRAG_ID_PREFIX.length)
      const draggedBox = active.data.current?.box as Box | undefined
      if (!draggedBox) return

      const currentBoxParentId = draggedBox.parent_box_id ?? null
      const moveBoxIds =
        selectedBoxIds.has(boxId) && selectedBoxIds.size > 0
          ? boxes
              .filter(
                (b) =>
                  selectedBoxIds.has(b.id) &&
                  (b.parent_box_id ?? null) === currentBoxParentId
              )
              .map((b) => b.id)
          : [boxId]

      setDndMoveLoading(true)
      try {
        const res = await fetch("/api/boxes/move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ boxIds: moveBoxIds, targetParentBoxId }),
        })
        if (!res.ok) throw new Error(await moveErrorMessage(res, "Failed to move box"))
        await Promise.all([
          loadBoxes([currentBoxParentId, targetParentBoxId]),
          loadItems(currentBoxId),
        ])
        bumpStatsRefreshKey()
      } catch (e) {
        console.error("Error moving box:", e)
        alertMoveFailed(e)
      } finally {
        setDndMoveLoading(false)
      }
    }
  }

  return {
    dndMoveLoading,
    dndActiveId,
    setDndActiveId,
    sensors,
    handleDragEnd,
  }
}
