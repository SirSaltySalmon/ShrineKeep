"use client"

import { useDraggable, useDroppable } from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"
import { useCallback } from "react"
import { Box } from "@/lib/types"
import { Selectable } from "@/components/selectable"
import { OWNER_CAPABILITIES } from "@/lib/sharing/presentation/capabilities"
import { presentOwnerBox } from "@/lib/sharing/presentation/adapters"
import BoxCard from "./box-card"

interface DroppableBoxCardProps {
  box: Box
  onBoxClick: (box: Box, e: React.MouseEvent) => void
  onRename?: (box: Box) => void
  onShowStats?: (box: Box) => void
  selected?: boolean
  selectionMode?: boolean
  registerBoxCardRef?: (id: string, el: HTMLDivElement | null) => void
}

const DROP_ID_PREFIX = "box-"
const DRAG_ID_PREFIX = "box-drag-"

export function getBoxDropId(boxId: string) {
  return DROP_ID_PREFIX + boxId
}

export function getBoxDragId(boxId: string) {
  return DRAG_ID_PREFIX + boxId
}

export default function DroppableBoxCard({ box, onBoxClick, onRename, onShowStats, selected = false, selectionMode = false, registerBoxCardRef }: DroppableBoxCardProps) {
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

  const presented = presentOwnerBox(box)

  return (
    <Selectable
      ref={mergedRef}
      selected={selected}
      selectionMode={selectionMode}
      isOver={isOver}
      style={style}
      className={isDragging ? "item-card-no-select !transition-none" : "item-card-no-select"}
      data-box-id={box.id}
      onClick={(e) => onBoxClick(box, e)}
      {...attributes}
      {...listeners}
    >
      <BoxCard
        box={presented}
        capabilities={OWNER_CAPABILITIES}
        frame="embedded"
        onBoxClick={() => {}}
        onRename={onRename ? () => onRename(box) : undefined}
        onShowStats={onShowStats ? () => onShowStats(box) : undefined}
      />
    </Selectable>
  )
}
