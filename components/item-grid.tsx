"use client"

import { useState, useEffect } from "react"
import { Item } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Plus, Sword, type LucideIcon } from "lucide-react"
import DraggableItemCard from "./draggable-item-card"
import ItemCard from "./item-card"
import ItemDialog from "./item-dialog"
import { SelectionActionBar } from "./selection-action-bar"
import { useCopiedItem } from "@/lib/copied-item-context"
import { useMarqueeSelection } from "@/lib/hooks/use-marquee-selection"

/** When provided (e.g. by dashboard), selection is controlled by parent; otherwise ItemGrid uses internal marquee selection. */
export interface ItemGridSelectionProps {
  selectedIds: Set<string>
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>
  registerCardRef: (id: string, el: HTMLDivElement | null) => void
}

interface ItemGridProps {
  items: Item[]
  currentBoxId: string | null
  onItemUpdate: () => void
  /** When set, the section title and Add Item button are shown on one row (title left, button right). */
  sectionTitle?: string
  /** Icon next to the section title (Lucide). Defaults to Sword. */
  sectionIcon?: LucideIcon
  /** When provided, use these for selection (dashboard); otherwise use internal useMarqueeSelection (wishlist, search). */
  selectionProps?: ItemGridSelectionProps
  /** When true, click only toggles selection; when false, click opens dialog (shift-click still toggles). */
  selectionMode?: boolean
  /** Called when shift-click happens to enable selection mode. */
  onEnterSelectionMode?: () => void
  /** Global collection item count (all boxes); used with itemCap to block New Item at limit. */
  totalItemCount?: number
  itemCap?: number | null
  isPro?: boolean
  /** Shown when user hits the free-tier item cap (new item, save, or paste — wired by parent). */
  onCapReached?: () => void
  /** Visual mode for item cards in this grid. */
  variant?: "collection" | "wishlist"
  /** Hide Add Item button, useful for read-only sub-sections. */
  showAddButton?: boolean
  /** Label for the add button (default "New Item"). */
  addButtonLabel?: string
  /** Initial Item Type when opening the new-item dialog from the dashboard (root or a box; wishlist page ignores). */
  defaultNewItemMode?: "collection" | "wishlist"
  /** Empty-state text override. */
  emptyText?: string
  /** Wishlist-only action. */
  onMarkAcquired?: (item: Item) => void
  /** Main wishlist page: ItemDialog stays in locked wishlist mode (no collection toggle). */
  wishlistDialogLocked?: boolean
  /** Public shared view: no add, dialog, selection/marquee, or paste bar. */
  readOnly?: boolean
}

export default function ItemGrid({
  items,
  currentBoxId,
  onItemUpdate,
  sectionTitle,
  sectionIcon: SectionIcon = Sword,
  selectionProps,
  selectionMode,
  onEnterSelectionMode,
  totalItemCount,
  itemCap = null,
  isPro = true,
  onCapReached,
  variant = "collection",
  showAddButton = true,
  addButtonLabel = "New Item",
  defaultNewItemMode = "collection",
  emptyText = "No items yet. Click \"New Item\" to get started.",
  onMarkAcquired,
  wishlistDialogLocked = false,
  readOnly = false,
}: ItemGridProps) {
  const { copiedItemRefs, copiedBoxRefs } = useCopiedItem()
  const internalMarquee = useMarqueeSelection()

  const selectedIds = selectionProps?.selectedIds ?? internalMarquee.selectedItemIds
  const setSelectedIds = selectionProps?.setSelectedIds ?? internalMarquee.setSelectedItemIds
  const registerCardRef = selectionProps?.registerCardRef ?? internalMarquee.registerItemCardRef
  const MarqueeOverlay = internalMarquee.MarqueeOverlay

  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [showItemDialog, setShowItemDialog] = useState(false)
  const [isNewItem, setIsNewItem] = useState(false)
  useEffect(() => {
    if (!selectionProps && !readOnly) setSelectedIds(new Set())
  }, [currentBoxId, setSelectedIds, selectionProps, readOnly])

  const handleNewItem = () => {
    const atCap =
      !isPro &&
      itemCap !== null &&
      totalItemCount !== undefined &&
      totalItemCount >= itemCap
    if (atCap) {
      onCapReached?.()
      return
    }
    setIsNewItem(true)
    setSelectedItem(null)
    setSelectedIds(new Set())
    setShowItemDialog(true)
  }

  const handleItemClick = (item: Item, e: React.MouseEvent) => {
    if (readOnly) return
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
      {addButtonLabel}
    </Button>
  )

  const showAdd = showAddButton && !readOnly

  return (
    <>
      <div className="rounded-md border bg-light-muted p-4">
        <div className={sectionTitle ? "flex flex-wrap items-center justify-between gap-4 mb-4 min-w-0" : "mb-4 min-w-0"}>
          {sectionTitle ? (
            <>
              <h2 className="text-fluid-xl font-semibold flex items-center min-w-0 truncate">
                <SectionIcon className="h-4 w-4 sm:h-5 sm:w-5 mr-2 shrink-0" />
                {sectionTitle}
              </h2>
              {showAdd ? addButton : null}
            </>
          ) : (
            showAdd ? addButton : null
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 relative">
        {items.map((item) => (
          variant === "collection" ? (
            <DraggableItemCard
              key={item.id}
              item={item}
              selected={selectedIds.has(item.id)}
              selectionMode={selectionMode ?? false}
              onClick={handleItemClick}
              registerCardRef={registerCardRef}
            />
          ) : (
            <div
              key={item.id}
              ref={readOnly ? undefined : (el) => registerCardRef(item.id, el)}
              data-item-id={item.id}
            >
              <ItemCard
                item={item}
                variant="wishlist"
                selected={readOnly ? false : selectedIds.has(item.id)}
                selectionMode={readOnly ? false : (selectionMode ?? false)}
                onClick={handleItemClick}
                onMarkAcquired={readOnly ? undefined : onMarkAcquired}
                readOnly={readOnly}
              />
            </div>
          )
        ))}
        </div>
        {items.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            {emptyText}
          </div>
        )}
      </div>
      {!selectionProps && !readOnly && <MarqueeOverlay />}
      {variant === "collection" &&
        !selectionProps &&
        !readOnly &&
        (selectedItems.length > 0 ||
          !!copiedItemRefs?.itemIds?.length ||
          !!copiedBoxRefs?.rootBoxIds?.length) && (
        <SelectionActionBar
          selectedItems={selectedItems}
          pasteTarget={{ boxId: currentBoxId, isWishlist: false }}
          onDeleteDone={onItemUpdate}
          onPasteDone={onItemUpdate}
          onClearSelection={() => setSelectedIds(new Set())}
        />
      )}
      {!readOnly && (
        <ItemDialog
          open={showItemDialog}
          onOpenChange={setShowItemDialog}
          item={selectedItem}
          isNew={isNewItem}
          boxId={currentBoxId}
          onSave={onItemUpdate}
          isWishlist={wishlistDialogLocked}
          defaultNewItemMode={defaultNewItemMode}
          onCapReached={onCapReached}
        />
      )}
    </>
  )
}
