"use client"

import { useMemo, useState } from "react"
import { Box } from "@/lib/types"
import { Skeleton } from "boneyard-js/react"
import { Button } from "@/components/ui/button"
import { Plus, Grid3x3 } from "lucide-react"
import DroppableBoxCard from "./droppable-box-card"
import BoxCard from "./box-card"
import { EmptyState } from "./empty-state"
import { BOX_SKELETON_FIXTURES } from "@/components/boneyard-fixtures"
import { OWNER_CAPABILITIES, type CollectionCapabilities } from "@/lib/sharing/presentation/capabilities"
import { presentOwnerBox } from "@/lib/sharing/presentation/adapters"
import {
  BOX_GRID_LAYOUT,
  getBoxCardMinHeightClass,
  getCardSkeletonName,
  getLoadingCardClass,
  takeLoadingFixtures,
} from "@/lib/card-density"
import { useCardDensity } from "@/lib/hooks/use-card-density"
import { useFadeOnChange } from "@/lib/hooks/use-fade-on-change"
import { useBoxSparklines } from "@/lib/hooks/use-box-sparklines"
import { cn } from "@/lib/utils"
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

const SKELETON_BOX_IDS: ReadonlySet<string> = new Set(BOX_SKELETON_FIXTURES.map((box) => box.id))

interface BoxGridProps {
  boxes: Box[]
  loading?: boolean
  /**
   * How many boxes the loaded grid will hold, when the caller knows. While loading, the grid
   * then shows that many skeleton cards (or the empty state for 0) and is already its final
   * height. Leave unset when unknown: one row of skeleton cards.
   */
  expectedCount?: number
  currentBoxId: string | null
  /** Called when a box is clicked (for navigation). Only called when not in selection mode and not shift-clicked. */
  onBoxClick: (box: Box | null) => void
  onRename?: (box: Box) => void
  onShowStats?: (box: Box) => void
  /** Called when a box is created. Should reload boxes. */
  onCreateBox?: (name: string, description: string) => Promise<void>
  /** When provided, card shows selection ring when true for that box. */
  isBoxSelected?: (boxId: string) => boolean
  /** Toggle box selection. */
  toggleBoxSelection?: (boxId: string) => void
  capabilities?: CollectionCapabilities
  /** When true, click only toggles selection; when false, click navigates (shift-click still toggles). */
  selectionMode?: boolean
  /** Register this card's root element for marquee intersection. */
  registerBoxCardRef?: (id: string, el: HTMLDivElement | null) => void
  /** Bump to refetch the box-card sparklines, like the stats panel's `refreshKey`. */
  statsRefreshKey?: number
}

export default function BoxGrid({
  boxes,
  loading = false,
  expectedCount,
  currentBoxId,
  onBoxClick,
  onRename,
  onShowStats,
  onCreateBox,
  isBoxSelected,
  toggleBoxSelection,
  capabilities = OWNER_CAPABILITIES,
  selectionMode = false,
  registerBoxCardRef,
  statsRefreshKey = 0,
}: BoxGridProps) {
  // Per-device preference. Comfortable on the server and until hydration has finished.
  const density = useCardDensity()
  const gridLayout = BOX_GRID_LAYOUT[density]

  // Sparklines are owner-only (`POST /api/boxes/sparklines`), so they follow the owner path:
  // the draggable cards below. A read-only grid never asks, even one that can show stats.
  const ownerGrid = capabilities.canDrag
  const boxIds = useMemo(
    // Skeleton fixtures have UUID-shaped ids the hook cannot tell from real ones; never ask for them.
    () => boxes.filter((box) => !SKELETON_BOX_IDS.has(box.id)).map((box) => box.id),
    [boxes]
  )
  const { sparklines } = useBoxSparklines(boxIds, {
    enabled: ownerGrid && !loading,
    refreshKey: statsRefreshKey,
  })
  // Owner cards always keep the sparkline row, drawn or empty, so a row of cards is one height.
  const cardMinHeightClass = getBoxCardMinHeightClass(density, ownerGrid)

  const [showNewBoxDialog, setShowNewBoxDialog] = useState(false)
  const [newBoxName, setNewBoxName] = useState("")
  const [newBoxDescription, setNewBoxDescription] = useState("")

  const handleBoxCardClick = (box: Box, e: React.MouseEvent) => {
    if (capabilities.canSelect && selectionMode) {
      toggleBoxSelection?.(box.id)
      return
    }
    if (capabilities.canSelect && e.shiftKey) {
      toggleBoxSelection?.(box.id)
      return
    }
    onBoxClick(box)
  }

  const handleCreateBox = async () => {
    if (!newBoxName.trim() || !onCreateBox) return
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
  const skeletonName = getCardSkeletonName("box-grid-card", density)
  // As many skeleton cards as boxes are expected; one row when that is not known.
  const displayedBoxes = loading ? takeLoadingFixtures(BOX_SKELETON_FIXTURES, gridLayout, expectedCount) : boxes
  // A view known to hold no boxes shows its empty state straight away, not bones that vanish.
  const showEmpty = loading ? expectedCount === 0 : boxes.length === 0
  // Whatever replaces bones fades in, and so does another box's contents arriving without a
  // load (a cached view). Bones never fade; an empty state that stays up through a refetch
  // keeps the same signal, so it does not flash.
  const showingBones = loading && !showEmpty
  const contentRef = useFadeOnChange<HTMLDivElement>(
    showingBones ? "bones" : `${showEmpty ? "empty" : "cards"}:${currentBoxId ?? "root"}`,
    { enabled: !showingBones }
  )

  return (
    <div className="mb-8 layout-shrink-visible rounded-md sk-outline bg-light-muted p-4">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 min-w-0">
        <h2 className="text-fluid-xl font-semibold flex items-center min-w-0 truncate">
          <Grid3x3 className="h-4 w-4 sm:h-5 sm:w-5 mr-2 shrink-0" />
          Boxes
        </h2>
        {capabilities.canCreate ? addButton : null}
      </div>
      <div ref={contentRef}>
      {showEmpty ? (
        // As tall as the row of cards the grid reserves while loading, so the section does not
        // jump between loading and empty; the 64px figure and its line sit centred in it.
        <EmptyState
          size="sm"
          className={cn(cardMinHeightClass, "flex flex-col justify-center", density === "compact" ? "py-2" : "py-6")}
        >
          {capabilities.canCreate ? "Try adding a new box!" : "Nothing is visible here."}
        </EmptyState>
      ) : (
        <div className={cn(cardMinHeightClass, gridLayout.gridClass)}>
          {displayedBoxes.map((box, index) => {
            const presented = presentOwnerBox(box)
            const fixtureCard = capabilities.canDrag ? (
              <DroppableBoxCard
                box={box}
                onBoxClick={() => {}}
                onRename={() => {}}
                onShowStats={() => {}}
                density={density}
                sparkline={null}
              />
            ) : (
              <BoxCard
                box={presented}
                capabilities={capabilities}
                density={density}
                onBoxClick={() => {}}
              />
            )

            const cardContent = loading ? (
              fixtureCard
            ) : capabilities.canDrag ? (
              <DroppableBoxCard
                box={box}
                onBoxClick={handleBoxCardClick}
                onRename={onRename}
                onShowStats={onShowStats}
                selected={isBoxSelected?.(box.id) ?? false}
                selectionMode={selectionMode}
                registerBoxCardRef={registerBoxCardRef}
                density={density}
                sparkline={sparklines[box.id.toLowerCase()] ?? null}
              />
            ) : (
              <BoxCard
                box={presented}
                capabilities={capabilities}
                selected={isBoxSelected?.(box.id) ?? false}
                selectionMode={selectionMode}
                density={density}
                onBoxClick={(next, event) => handleBoxCardClick(box, event)}
                onRename={onRename ? () => onRename(box) : undefined}
                onShowStats={onShowStats ? () => onShowStats(box) : undefined}
              />
            )

            const skeletonNode = (
              <Skeleton name={skeletonName} loading={loading} fixture={fixtureCard}>
                {cardContent}
              </Skeleton>
            )

            if (loading) {
              return (
                <div key={`${box.id}-${index}`} className={getLoadingCardClass(gridLayout, index, expectedCount)}>
                  {skeletonNode}
                </div>
              )
            }

            return <Skeleton key={box.id} name={skeletonName} loading={loading} fixture={fixtureCard}>{cardContent}</Skeleton>
          })}
        </div>
      )}
      </div>
    </div>
  )
}
