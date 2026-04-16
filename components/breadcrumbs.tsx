"use client"

import { useEffect, useState } from "react"
import { useDroppable } from "@dnd-kit/core"
import { createSupabaseClient } from "@/lib/supabase/client"
import { Box } from "@/lib/types"
import { cn } from "@/lib/utils"
import { ChevronRight, Home } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getBoxDragId } from "@/components/droppable-box-card"

export const BREADCRUMB_ROOT_DROP_ID = "breadcrumb-root"

const BREADCRUMB_BOX_PREFIX = "breadcrumb-box-"

export function getBreadcrumbBoxDropId(boxId: string) {
  return BREADCRUMB_BOX_PREFIX + boxId
}

interface BreadcrumbsProps {
  currentBoxId: string | null
  onBoxClick: (box: Box | null) => void
  /** When true, crumbs are drop targets (must be inside DndContext). */
  enableDropTargets?: boolean
  /** Active draggable id from DndContext (for disabling invalid crumbs). */
  activeDragId?: string | null
  /** Selected box ids when dragging boxes (avoid dropping onto a box being moved). */
  selectedBoxIds?: ReadonlySet<string>
}

function DroppableHomeCrumb({
  onNavigate,
  dropDisabled,
  dragActive,
}: {
  onNavigate: () => void
  /** When already at root, home is not a move target. */
  dropDisabled: boolean
  /** Prevent accidental navigation click while an active drag is in progress. */
  dragActive: boolean
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: BREADCRUMB_ROOT_DROP_ID,
    data: { type: "breadcrumb", targetBoxId: null as string | null },
    disabled: dropDisabled,
  })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-11 min-w-11 items-center justify-center rounded-md p-2 transition-colors shrink-0 touch-none",
        isOver && "bg-primary/10 ring-2 ring-primary/40 ring-offset-2 ring-offset-background"
      )}
    >
      <Button
        variant="ghost"
        size="sm"
        type="button"
        onClick={() => {
          if (dragActive) return
          onNavigate()
        }}
        className={cn("h-8 shrink-0", isOver && "text-primary")}
      >
        <Home className="h-4 w-4" />
      </Button>
    </div>
  )
}

function DroppableBoxCrumb({
  box,
  onNavigate,
  activeDragId,
  selectedBoxIds,
  isLast = false,
}: {
  box: Box
  onNavigate: () => void
  activeDragId: string | null
  selectedBoxIds: ReadonlySet<string>
  isLast?: boolean
}) {
  const dropId = getBreadcrumbBoxDropId(box.id)
  const isDraggingThisBox = activeDragId === getBoxDragId(box.id)
  const isBoxDrag = Boolean(activeDragId?.startsWith("box-drag-"))
  const isSelectedMoveTarget = isBoxDrag && selectedBoxIds.has(box.id)
  const dragActive = activeDragId != null

  const { isOver, setNodeRef } = useDroppable({
    id: dropId,
    data: { type: "breadcrumb", targetBoxId: box.id },
    disabled: isDraggingThisBox || isSelectedMoveTarget,
  })

  return (
    <div className={cn("flex items-center layout-shrink-visible min-w-0", isLast && "flex-1")}>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-11 min-w-0 max-w-full items-center rounded-md px-2 py-1 transition-colors touch-none",
          isOver && "bg-primary/10 ring-2 ring-primary/40 ring-offset-2 ring-offset-background"
        )}
      >
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={() => {
            if (dragActive) return
            onNavigate()
          }}
          className={cn(
            "h-8 min-w-0 max-w-full overflow-hidden",
            isOver && "text-primary"
          )}
        >
          <span className="block min-w-0 truncate-line text-left">{box.name}</span>
        </Button>
      </div>
    </div>
  )
}

export default function Breadcrumbs({
  currentBoxId,
  onBoxClick,
  enableDropTargets = false,
  activeDragId = null,
  selectedBoxIds = new Set(),
}: BreadcrumbsProps) {
  const [path, setPath] = useState<Box[]>([])
  const supabase = createSupabaseClient()
  const dragActive = activeDragId != null

  useEffect(() => {
    loadPath()
  }, [currentBoxId])

  const loadPath = async () => {
    if (!currentBoxId) {
      setPath([])
      return
    }

    const boxes: Box[] = []
    let currentId: string | null = currentBoxId

    while (currentId) {
      const { data } = (await supabase
        .from("boxes")
        .select("*")
        .eq("id", currentId)
        .single()) as { data: Box | null }

      if (data) {
        boxes.unshift(data)
        currentId = data.parent_box_id || null
      } else {
        break
      }
    }

    setPath(boxes)
  }

  return (
    <nav className="flex items-center space-x-2 text-fluid-sm layout-shrink-visible">
      {enableDropTargets ? (
        <DroppableHomeCrumb
          onNavigate={() => onBoxClick(null)}
          dropDisabled={!currentBoxId}
          dragActive={dragActive}
        />
      ) : (
        <div className="flex min-h-11 min-w-11 items-center justify-center rounded-md p-2 shrink-0 touch-none">
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => onBoxClick(null)}
            className="h-8 shrink-0"
          >
            <Home className="h-4 w-4" />
          </Button>
        </div>
      )}
      {path.map((box, index) => {
        const isLast = index === path.length - 1
        if (enableDropTargets && isLast) {
          return (
            <div
              key={box.id}
              className={cn(
                "flex items-center layout-shrink-visible min-w-0 flex-1"
              )}
            >
              <div className="flex min-h-11 min-w-0 max-w-full items-center rounded-md px-2 py-1 touch-none">
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => {
                    if (dragActive) return
                    onBoxClick(box)
                  }}
                  className="h-8 min-w-0 max-w-full overflow-hidden"
                >
                  <span className="block min-w-0 truncate-line text-left">
                    {box.name}
                  </span>
                </Button>
              </div>
            </div>
          )
        }
        if (enableDropTargets) {
          return (
            <DroppableBoxCrumb
              key={box.id}
              box={box}
              onNavigate={() => onBoxClick(box)}
              activeDragId={activeDragId}
              selectedBoxIds={selectedBoxIds}
              isLast={isLast}
            />
          )
        }
        return (
          <div
            key={box.id}
            className={cn(
              "flex items-center layout-shrink-visible",
              isLast && "min-w-0 flex-1"
            )}
          >
            <div className="flex min-h-11 min-w-0 max-w-full items-center rounded-md px-2 py-1 touch-none">
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => onBoxClick(box)}
                className="h-8 min-w-0 max-w-full overflow-hidden"
              >
                <span className="block min-w-0 truncate-line text-left">
                  {box.name}
                </span>
              </Button>
            </div>
          </div>
        )
      })}
    </nav>
  )
}
