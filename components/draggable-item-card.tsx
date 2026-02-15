"use client"

import { useCallback } from "react"
import { useDraggable } from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"
import { Item } from "@/lib/types"
import ItemCard from "./item-card"

const DRAG_ID_PREFIX = "item-"

export function getItemDragId(itemId: string) {
  return DRAG_ID_PREFIX + itemId
}

interface DraggableItemCardProps {
  item: Item
  selected?: boolean
  onClick: (item: Item, e: React.MouseEvent) => void
  /** Register this card's root element for marquee intersection. */
  registerCardRef?: (id: string, el: HTMLDivElement | null) => void
}

export default function DraggableItemCard({
  item,
  selected = false,
  onClick,
  registerCardRef,
}: DraggableItemCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: getItemDragId(item.id),
    data: { type: "item", item },
  })

  const mergedRef = useCallback(
    (el: HTMLDivElement | null) => {
      setNodeRef(el)
      registerCardRef?.(item.id, el)
    },
    [setNodeRef, registerCardRef, item.id]
  )

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={mergedRef}
      style={style}
      data-item-id={item.id}
      {...attributes}
      {...listeners}
    >
      <ItemCard
        item={item}
        variant="collection"
        selected={selected}
        onClick={onClick}
      />
    </div>
  )
}
