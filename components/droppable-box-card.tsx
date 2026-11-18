"use client"

import { useDndContext, useDraggable, useDroppable } from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"
import { useCallback, useMemo } from "react"
import { Box } from "@/lib/types"
import { cn } from "@/lib/utils"
import { BOX_DRAG_ID_PREFIX, shouldCueBoxDrop } from "@/lib/dashboard-drop-targets"
import { Selectable } from "@/components/selectable"
import { OWNER_CAPABILITIES } from "@/lib/sharing/presentation/capabilities"
import { presentOwnerBox } from "@/lib/sharing/presentation/adapters"
import type { CardDensity } from "@/lib/card-density"
import type { BoxSparklineSeries } from "@/lib/stats/box-sparkline"
import BoxCard from "./box-card"

interface DroppableBoxCardProps {
  box: Box
  onBoxClick: (box: Box, e: React.MouseEvent) => void
  onRename?: (box: Box) => void
  onShowStats?: (box: Box) => void
  selected?: boolean
  selectionMode?: boolean
  registerBoxCardRef?: (id: string, el: HTMLDivElement | null) => void
  /** Forwarded to `BoxCard`. */
  density?: CardDensity
  /** Forwarded to `BoxCard`: a series, `null` to keep the row empty, or leave out for no row. */
  sparkline?: BoxSparklineSeries | null
}

const DROP_ID_PREFIX = "box-"
const DRAG_ID_PREFIX = BOX_DRAG_ID_PREFIX

export function getBoxDropId(boxId: string) {
  return DROP_ID_PREFIX + boxId
}

export function getBoxDragId(boxId: string) {
  return DRAG_ID_PREFIX + boxId
}

export default function DroppableBoxCard({
  box,
  onBoxClick,
  onRename,
  onShowStats,
  selected = false,
  selectionMode = false,
  registerBoxCardRef,
  density,
  sparkline,
}: DroppableBoxCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    transform,
    isDragging,
  } = useDraggable({
    id: getBoxDragId(box.id),
    data: { type: "box", box },
  })

  const { isOver, setNodeRef: setDropRef } = useDroppable({
    id: getBoxDropId(box.id),
    data: { type: "box", box },
    disabled: isDragging,
  })

  // Read from dnd-kit instead of props: every box card advertises itself as soon as a drag
  // starts, except the dragged box and, for box drags, the rest of the selection.
  const { active } = useDndContext()
  const activeDragId = active ? String(active.id) : null
  const showDropCue = shouldCueBoxDrop(activeDragId, box.id, selected) && !isOver

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    touchAction: "none" as const,
  }

  const mergedRef = useCallback(
    (node: HTMLDivElement | null) => {
      setDropRef(node)
      setDragRef(node)
      registerBoxCardRef?.(box.id, node)
    },
    [setDropRef, setDragRef, registerBoxCardRef, box.id]
  )

  // `useDndContext()` re-renders this wrapper on every pointer move of a drag. The card body
  // does not depend on drag state, so keep its element stable and let React skip it.
  const card = useMemo(
    () => (
      <BoxCard
        box={presentOwnerBox(box)}
        capabilities={OWNER_CAPABILITIES}
        frame="embedded"
        density={density}
        sparkline={sparkline}
        onBoxClick={() => {}}
        onRename={onRename ? () => onRename(box) : undefined}
        onShowStats={onShowStats ? () => onShowStats(box) : undefined}
      />
    ),
    [box, onRename, onShowStats, density, sparkline]
  )

  return (
    <Selectable
      ref={mergedRef}
      selected={selected}
      selectionMode={selectionMode}
      isOver={isOver}
      style={style}
      className={cn(
        "item-card-no-select",
        // Draggable, so a grab hand instead of Selectable's pointer.
        isDragging ? "cursor-grabbing !transition-none" : "cursor-grab active:cursor-grabbing",
        // Same footprint as the "is over" ring (2px at a 2px offset), which replaces it on hover.
        showDropCue && "outline-dashed outline-2 outline-offset-2 outline-primary/60"
      )}
      data-box-id={box.id}
      onClick={(e) => onBoxClick(box, e)}
      {...attributes}
      {...listeners}
    >
      {card}
    </Selectable>
  )
}
