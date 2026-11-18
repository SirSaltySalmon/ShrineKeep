"use client"

import { useDndContext, useDroppable } from "@dnd-kit/core"
import { ArrowUpToLine } from "lucide-react"

export const MOVE_TO_PARENT_ZONE_ID = "drop-zone-parent"

interface MoveToParentZoneProps {
  /** When true, label is "Move to root (no box)". When false, "Move to parent" or use parentBoxName if set. */
  isRoot?: boolean
  /** Name of the box one level up. Omit for top-level boxes, whose parent is the root. */
  parentBoxName?: string
}

export default function MoveToParentZone({ isRoot, parentBoxName }: MoveToParentZoneProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: MOVE_TO_PARENT_ZONE_ID,
    data: { type: "parent" },
  })
  // Everything draggable in this view can go one level up, so any drag lights the zone.
  const dragActive = useDndContext().active != null

  const label = parentBoxName
    ? `Move to "${parentBoxName}"`
    : isRoot
      ? "Move to root (no box)"
      : "Move to parent"

  // One state at a time, so two border, fill or text colours never compete on the same element.
  const stateClass = isOver
    ? "border-primary bg-primary/10 text-primary"
    : dragActive
      ? "border-primary/60 bg-light-muted text-muted-foreground"
      : "border-muted-foreground/30 bg-light-muted text-muted-foreground"

  return (
    <div
      ref={setNodeRef}
      className={`flex items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-3 text-fluid-sm transition-colors layout-shrink-visible ${stateClass}`}
    >
      <ArrowUpToLine className="h-4 w-4 shrink-0" />
      <span className="truncate min-w-0">{label}</span>
    </div>
  )
}
