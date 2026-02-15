"use client"

import { Box } from "@/lib/types"
import DroppableBoxCard from "./droppable-box-card"

interface BoxGridProps {
  boxes: Box[]
  onBoxClick: (box: Box, e: React.MouseEvent) => void
  onRename?: (box: Box) => void
  onShowStats?: (box: Box) => void
  /** When provided, card shows selection ring when true for that box. */
  isBoxSelected?: (boxId: string) => boolean
  /** When true, card shows lighter ring on hover (selection mode). */
  selectionMode?: boolean
}

export default function BoxGrid({ boxes, onBoxClick, onRename, onShowStats, isBoxSelected, selectionMode = false }: BoxGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {boxes.map((box) => (
        <DroppableBoxCard
          key={box.id}
          box={box}
          onBoxClick={onBoxClick}
          onRename={onRename}
          onShowStats={onShowStats}
          selected={isBoxSelected?.(box.id) ?? false}
          selectionMode={selectionMode}
        />
      ))}
    </div>
  )
}
