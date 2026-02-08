"use client"

import { Box } from "@/lib/types"
import DroppableBoxCard from "./droppable-box-card"

interface BoxGridProps {
  boxes: Box[]
  onBoxClick: (box: Box) => void
  onRename?: (box: Box) => void
  onShowStats?: (box: Box) => void
}

export default function BoxGrid({ boxes, onBoxClick, onRename, onShowStats }: BoxGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {boxes.map((box) => (
        <DroppableBoxCard
          key={box.id}
          box={box}
          onBoxClick={onBoxClick}
          onRename={onRename}
          onShowStats={onShowStats}
        />
      ))}
    </div>
  )
}
