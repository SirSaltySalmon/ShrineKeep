"use client"

import { useState, useEffect } from "react"
import { Item } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Plus, Sword } from "lucide-react"
import DraggableItemCard from "./draggable-item-card"
import ItemDialog from "./item-dialog"
import { SelectionActionBar } from "./selection-action-bar"
import { useCopiedItem } from "@/lib/copied-item-context"
import { useMarqueeSelection } from "@/lib/hooks/use-marquee-selection"
import type { MarqueeRect } from "@/lib/hooks/use-marquee-selection"

/** When provided (e.g. by dashboard), selection is controlled by parent; otherwise ItemGrid uses internal marquee selection. */
export interface ItemGridSelectionProps {
  selectedIds: Set<string>
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>
  gridRef: React.RefObject<HTMLDivElement>
  registerCardRef: (id: string, el: HTMLDivElement | null) => void
  handleGridMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void
  marquee: MarqueeRect | null
}

interface ItemGridProps {
  items: Item[]
  currentBoxId: string | null
  onItemUpdate: () => void
  /** When set, the section title and Add Item button are shown on one row (title left, button right). */
  sectionTitle?: string
  /** When provided, use these for selection (dashboard); otherwise use internal useMarqueeSelection (wishlist, search). */
  selectionProps?: ItemGridSelectionProps
  /** When true, click only toggles selection; when false, click opens dialog (shift-click still toggles). */
  selectionMode?: boolean
}

export default function ItemGrid({ items, currentBoxId, onItemUpdate, sectionTitle, selectionProps, selectionMode }: ItemGridProps) {
  const { copied } = useCopiedItem()
  const internalMarquee = useMarqueeSelection()

  const selectedIds = selectionProps?.selectedIds ?? internalMarquee.selectedIds
  const setSelectedIds = selectionProps?.setSelectedIds ?? internalMarquee.setSelectedIds
  const gridRef = selectionProps?.gridRef ?? internalMarquee.gridRef
  const registerCardRef = selectionProps?.registerCardRef ?? internalMarquee.registerCardRef
  const handleGridMouseDown = selectionProps?.handleGridMouseDown ?? internalMarquee.handleGridMouseDown
  const marquee = selectionProps?.marquee ?? internalMarquee.marquee

  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [showItemDialog, setShowItemDialog] = useState(false)
  const [isNewItem, setIsNewItem] = useState(false)

  useEffect(() => {
    if (!selectionProps) setSelectedIds(new Set())
  }, [currentBoxId, setSelectedIds, selectionProps])

  const handleNewItem = () => {
    setIsNewItem(true)
    setSelectedItem(null)
    setSelectedIds(new Set())
    setShowItemDialog(true)
  }

  const handleItemClick = (item: Item, e: React.MouseEvent) => {
    if (selectionMode) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(item.id)) next.delete(item.id)
        else next.add(item.id)
        return next
      })
      return
    }
    if (e.shiftKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(item.id)) next.delete(item.id)
        else next.add(item.id)
        return next
      })
      return
    }
    setSelectedIds(new Set())
    setIsNewItem(false)
    setSelectedItem(item)
    setShowItemDialog(true)
  }

  const selectedItems = items.filter((i) => selectedIds.has(i.id))

  const addButton = (
    <Button onClick={handleNewItem}>
      <Plus className="h-4 w-4 mr-2" />
      New Item
    </Button>
  )

  return (
    <>
      <div className="rounded-md border bg-light-muted p-4">
        <div className={sectionTitle ? "flex flex-wrap items-center justify-between gap-4 mb-4 min-w-0" : "mb-4 min-w-0"}>
          {sectionTitle ? (
            <>
              <h2 className="text-fluid-xl font-semibold flex items-center min-w-0 truncate">
                <Sword className="h-4 w-4 sm:h-5 sm:w-5 mr-2 shrink-0" />
                {sectionTitle}
              </h2>
              {addButton}
            </>
          ) : (
            addButton
          )}
        </div>
        <div
          ref={gridRef as React.RefObject<HTMLDivElement>}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 relative"
          onMouseDown={handleGridMouseDown}
        >
        {items.map((item) => (
          <DraggableItemCard
            key={item.id}
            item={item}
            selected={selectedIds.has(item.id)}
            selectionMode={selectionMode ?? false}
            onClick={handleItemClick}
            registerCardRef={registerCardRef}
          />
        ))}
        </div>
        {items.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No items yet. Click &quot;New Item&quot; to get started.
          </div>
        )}
      </div>
      {marquee && (
        <div
          className="pointer-events-none fixed border-2 border-primary/50 bg-primary/10 z-50"
          style={{
            left: Math.min(marquee.startX, marquee.endX),
            top: Math.min(marquee.startY, marquee.endY),
            width: Math.abs(marquee.endX - marquee.startX),
            height: Math.abs(marquee.endY - marquee.startY),
          }}
        />
      )}
      {!selectionProps && (selectedItems.length > 0 || (copied !== null && copied.length > 0)) && (
        <SelectionActionBar
          selectedItems={selectedItems}
          pasteTarget={{ boxId: currentBoxId, isWishlist: false }}
          onDeleteDone={onItemUpdate}
          onPasteDone={onItemUpdate}
          onClearSelection={() => setSelectedIds(new Set())}
        />
      )}
      <ItemDialog
        open={showItemDialog}
        onOpenChange={setShowItemDialog}
        item={selectedItem}
        isNew={isNewItem}
        boxId={currentBoxId}
        onSave={onItemUpdate}
      />
    </>
  )
}
