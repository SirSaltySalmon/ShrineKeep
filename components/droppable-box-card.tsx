"use client"

import { useDraggable, useDroppable } from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"
import { Box } from "@/lib/types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"
import { Package, Pencil, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"

interface DroppableBoxCardProps {
  box: Box
  onBoxClick: (box: Box) => void
  onRename?: (box: Box) => void
  onShowStats?: (box: Box) => void
}

const DROP_ID_PREFIX = "box-"
const DRAG_ID_PREFIX = "box-drag-"

export function getBoxDropId(boxId: string) {
  return DROP_ID_PREFIX + boxId
}

export function getBoxDragId(boxId: string) {
  return DRAG_ID_PREFIX + boxId
}

export default function DroppableBoxCard({ box, onBoxClick, onRename, onShowStats }: DroppableBoxCardProps) {
  const { isOver, setNodeRef: setDropRef } = useDroppable({
    id: getBoxDropId(box.id),
    data: { type: "box", box },
  })

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

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <Card
      ref={(node) => {
        setDropRef(node)
        setDragRef(node)
      }}
      style={style}
      className={`cursor-pointer hover:shadow-lg transition-shadow ${
        isOver ? "ring-2 ring-primary ring-offset-2" : ""
      }`}
      onClick={() => onBoxClick(box)}
      {...attributes}
      {...listeners}
    >
      <CardHeader>
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center space-x-2 min-w-0 overflow-hidden">
            <Package className="h-4 w-4 sm:h-5 sm:w-5 shrink-0 text-muted-foreground" />
            <CardTitle className="text-fluid-lg truncate">{box.name}</CardTitle>
          </div>
          <div className="flex shrink-0 gap-0.5">
            {onShowStats && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => {
                  e.stopPropagation()
                  onShowStats(box)
                }}
                aria-label="View value and acquisition graphs"
                title="Value & acquisition graphs"
              >
                <TrendingUp className="h-4 w-4" />
              </Button>
            )}
            {onRename && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => {
                  e.stopPropagation()
                  onRename(box)
                }}
                aria-label="Rename box"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        {box.description && (
          <CardDescription className="line-clamp-2">
            {box.description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-1 text-fluid-sm text-muted-foreground min-w-0 overflow-hidden">
          {box.total_value !== undefined && (
            <div className="truncate">Total Value: {formatCurrency(box.total_value)}</div>
          )}
          {box.total_acquisition_cost !== undefined && (
            <div className="truncate">Acquired: {formatCurrency(box.total_acquisition_cost)}</div>
          )}
          {box.item_count !== undefined && (
            <div className="truncate">{box.item_count} items</div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
