"use client"

import { useState } from "react"
import { Box } from "@/lib/types"
import { Skeleton } from "boneyard-js/react"
import { Button } from "@/components/ui/button"
import { Plus, Grid3x3 } from "lucide-react"
import DroppableBoxCard from "./droppable-box-card"
import { BOX_SKELETON_FIXTURES } from "@/components/boneyard-fixtures"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const LOADING_ROW_VISIBILITY = ["", "hidden md:block", "hidden lg:block", "hidden xl:block"] as const

interface BoxGridProps {
  boxes: Box[]
  loading?: boolean
  currentBoxId: string | null
  /** Called when a box is clicked (for navigation). Only called when not in selection mode and not shift-clicked. */
  onBoxClick: (box: Box | null) => void
  onRename?: (box: Box) => void
  onShowStats?: (box: Box) => void
  /** Called when a box is created. Should reload boxes. */
  onCreateBox: (name: string, description: string) => Promise<void>
  /** When provided, card shows selection ring when true for that box. */
  isBoxSelected?: (boxId: string) => boolean
  /** Toggle box selection. */
  toggleBoxSelection: (boxId: string) => void
  /** When true, click only toggles selection; when false, click navigates (shift-click still toggles). */
  selectionMode?: boolean
  /** Called when shift-click happens to enable selection mode. */
  onEnterSelectionMode?: () => void
  /** Register this card's root element for marquee intersection. */
  registerBoxCardRef?: (id: string, el: HTMLDivElement | null) => void
}

export default function BoxGrid({
  boxes,
  loading = false,
  currentBoxId,
  onBoxClick,
  onRename,
  onShowStats,
  onCreateBox,
  isBoxSelected,
  toggleBoxSelection,
  selectionMode = false,
  onEnterSelectionMode,
  registerBoxCardRef,
}: BoxGridProps) {
  const [showNewBoxDialog, setShowNewBoxDialog] = useState(false)
  const [newBoxName, setNewBoxName] = useState("")
  const [newBoxDescription, setNewBoxDescription] = useState("")

  const handleBoxCardClick = (box: Box, e: React.MouseEvent) => {
    if (selectionMode) {
      toggleBoxSelection(box.id)
      return
    }
    if (e.shiftKey) {
      toggleBoxSelection(box.id)
      return
    }
    onBoxClick(box)
  }

  const handleCreateBox = async () => {
    if (!newBoxName.trim()) return
    await onCreateBox(newBoxName, newBoxDescription)
    setNewBoxName("")
    setNewBoxDescription("")
    setShowNewBoxDialog(false)
  }

  const addButton = (
    <Dialog open={showNewBoxDialog} onOpenChange={setShowNewBoxDialog}>
      <Button onClick={() => setShowNewBoxDialog(true)} className="shrink-0">
        <Plus className="h-4 w-4 mr-2 shrink-0" />
        <span className="truncate">New Box</span>
      </Button>
      <DialogContent className="min-w-0">
        <DialogHeader className="min-w-0">
          <DialogTitle>Create New Box</DialogTitle>
          <DialogDescription>
            Create a new collection box to organize your items.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4 layout-shrink-visible">
          <div className="min-w-0">
            <Label>Name</Label>
            <Input
              value={newBoxName}
              onChange={(e) => setNewBoxName(e.target.value)}
              placeholder="My Collection"
            />
          </div>
          <div className="min-w-0">
            <Label>Description (optional)</Label>
            <Input
              value={newBoxDescription}
              onChange={(e) => setNewBoxDescription(e.target.value)}
              placeholder="A brief description..."
            />
          </div>
        </div>
        <DialogFooter className="min-w-0">
          <Button variant="outline" onClick={() => setShowNewBoxDialog(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreateBox}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
  const displayedBoxes = loading ? BOX_SKELETON_FIXTURES.slice(0, 4) : boxes

  return (
    <div className="mb-8 layout-shrink-visible rounded-md border bg-light-muted p-4">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 min-w-0">
        <h2 className="text-fluid-xl font-semibold flex items-center min-w-0 truncate">
          <Grid3x3 className="h-4 w-4 sm:h-5 sm:w-5 mr-2 shrink-0" />
          Boxes
        </h2>
        {addButton}
      </div>
      {!loading && boxes.length === 0 ? (
        <div className="min-h-[152px] text-center py-8 text-muted-foreground">
          Try adding a new box!
        </div>
      ) : (
        <div className="min-h-[152px] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {displayedBoxes.map((box, index) => {
            const fixtureCard = (
              <DroppableBoxCard
                box={box}
                onBoxClick={() => {}}
                onRename={() => {}}
                onShowStats={() => {}}
              />
            )

            const cardContent = loading ? (
              fixtureCard
            ) : (
              <DroppableBoxCard
                box={box}
                onBoxClick={handleBoxCardClick}
                onRename={onRename}
                onShowStats={onShowStats}
                selected={isBoxSelected?.(box.id) ?? false}
                selectionMode={selectionMode}
                registerBoxCardRef={registerBoxCardRef}
              />
            )

            const skeletonNode = (
              <Skeleton name="box-grid-card" loading={loading} fixture={fixtureCard}>
                {cardContent}
              </Skeleton>
            )

            if (loading) {
              return (
                <div key={`${box.id}-${index}`} className={LOADING_ROW_VISIBILITY[index] ?? "hidden"}>
                  {skeletonNode}
                </div>
              )
            }

            return <Skeleton key={box.id} name="box-grid-card" loading={loading} fixture={fixtureCard}>{cardContent}</Skeleton>
          })}
        </div>
      )}
    </div>
  )
}
