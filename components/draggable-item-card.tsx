"use client"

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
  onClick: (item: Item) => void
}

export default function DraggableItemCard({ item, onClick }: DraggableItemCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useDraggable({
    id: getItemDragId(item.id),
    data: { type: "item", item },
  })

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <ItemCard
        item={item}
        variant="collection"
        onClick={onClick}
      />
    </div>
  )
}
