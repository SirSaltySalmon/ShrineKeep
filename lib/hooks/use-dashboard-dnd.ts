"use client"

import { useState } from "react"
import { TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { NonTouchPointerSensor } from "@/lib/non-touch-pointer-sensor"
import { MOVE_TO_PARENT_ZONE_ID } from "@/components/move-to-parent-zone"
import { BREADCRUMB_ROOT_DROP_ID } from "@/components/breadcrumbs"
import type { Box, Item } from "@/lib/types"

interface UseDashboardDndParams {
  currentBoxId: string | null
  currentBox: Box | null
  items: Item[]
  boxes: Box[]
  selectedItemIds: Set<string>
  selectedBoxIds: Set<string>
  loadItems: (boxId: string | null) => Promise<void>
  loadBoxes: () => Promise<void>
  bumpStatsRefreshKey: () => void
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

    let targetParentBoxId: string | null = null
    if (overId === MOVE_TO_PARENT_ZONE_ID) {
      targetParentBoxId = currentBox?.parent_box_id ?? null
    } else if (overId === BREADCRUMB_ROOT_DROP_ID) {
      targetParentBoxId = null
    } else if (overId.startsWith("breadcrumb-box-")) {
      targetParentBoxId = overId.slice("breadcrumb-box-".length)
    } else if (overId.startsWith("box-")) {
      targetParentBoxId = overId.slice("box-".length)
    } else {
      return
    }

    if (activeId.startsWith("item-")) {
      const itemId = activeId.slice("item-".length)
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
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error ?? "Failed to move item")
        }
        await Promise.all([loadItems(currentBoxId), loadBoxes()])
        bumpStatsRefreshKey()
      } catch (e) {
        console.error("Error moving item:", e)
      } finally {
        setDndMoveLoading(false)
      }
      return
    }

    if (activeId.startsWith("box-drag-")) {
      const boxId = activeId.slice("box-drag-".length)
      const draggedBox = active.data.current?.box as Box | undefined
      if (!draggedBox) return

      if (targetParentBoxId !== null && selectedBoxIds.has(targetParentBoxId)) {
        return
      }

      const currentBoxParentId = draggedBox.parent_box_id ?? null
      const moveBoxIdsBase =
        selectedBoxIds.has(boxId) && selectedBoxIds.size > 0
          ? boxes
              .filter(
                (b) =>
                  selectedBoxIds.has(b.id) &&
                  (b.parent_box_id ?? null) === currentBoxParentId
              )
              .map((b) => b.id)
          : [boxId]

      const moveBoxIds = moveBoxIdsBase.filter((id) => id !== targetParentBoxId)
      if (moveBoxIds.length === 0) return

      setDndMoveLoading(true)
      try {
        const res = await fetch("/api/boxes/move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ boxIds: moveBoxIds, targetParentBoxId }),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error ?? "Failed to move box")
        }
        await Promise.all([loadBoxes(), loadItems(currentBoxId)])
        bumpStatsRefreshKey()
      } catch (e) {
        console.error("Error moving box:", e)
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
