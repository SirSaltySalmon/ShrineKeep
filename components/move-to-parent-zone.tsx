"use client"

import { useDroppable } from "@dnd-kit/core"
import { ArrowUpToLine } from "lucide-react"

export const MOVE_TO_PARENT_ZONE_ID = "drop-zone-parent"

interface MoveToParentZoneProps {
  /** When true, label is "Move to root (no box)". When false, "Move to parent" or use parentBoxName if set. */
  isRoot?: boolean
  parentBoxName?: string
}

export default function MoveToParentZone({ isRoot, parentBoxName }: MoveToParentZoneProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: MOVE_TO_PARENT_ZONE_ID,
    data: { type: "parent" },
  })

  const label = parentBoxName
    ? `Move to "${parentBoxName}"`
    : isRoot
      ? "Move to root (no box)"
      : "Move to parent"

  return (
    <div
      ref={setNodeRef}
      className={`flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/30 bg-light-muted px-4 py-3 text-fluid-sm text-muted-foreground transition-colors layout-shrink-visible ${
        isOver ? "border-primary bg-primary/10 text-primary" : ""
      }`}
    >
      <ArrowUpToLine className="h-4 w-4 shrink-0" />
      <span className="truncate min-w-0">{label}</span>
    </div>
  )
}
