"use client"

import { useState, useEffect, type ReactNode } from "react"
import Link from "next/link"
import { Item } from "@/lib/types"
import { Skeleton } from "boneyard-js/react"
import { Button } from "@/components/ui/button"
import { Plus, Sword, type LucideIcon } from "lucide-react"
import DraggableItemCard from "./draggable-item-card"
import ItemCard from "./item-card"
import ItemDialog from "./item-dialog"
import { EmptyState } from "./empty-state"
import { SelectionActionBar } from "./selection-action-bar"
import { useCopiedItem } from "@/lib/copied-item-context"
import { useMarqueeSelection } from "@/lib/hooks/use-marquee-selection"
import {
  COLLECTION_ITEM_SKELETON_FIXTURES,
  WISHLIST_ITEM_SKELETON_FIXTURES,
} from "@/components/boneyard-fixtures"
import { OWNER_CAPABILITIES, READ_ONLY_CAPABILITIES, type CollectionCapabilities } from "@/lib/sharing/presentation/capabilities"
import { presentOwnerItem } from "@/lib/sharing/presentation/adapters"
import { ITEM_GRID_LAYOUT, getCardSkeletonName, getLoadingCardClass, takeLoadingFixtures } from "@/lib/card-density"
import { useCardDensity } from "@/lib/hooks/use-card-density"
import { useFadeOnChange } from "@/lib/hooks/use-fade-on-change"
import { FadeOnChange } from "./fade-on-change"
import { cn } from "@/lib/utils"

/** When provided (e.g. by dashboard), selection is controlled by parent; otherwise ItemGrid uses internal marquee selection. */
export interface ItemGridSelectionProps {
  selectedIds: Set<string>
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>
  registerCardRef: (id: string, el: HTMLDivElement | null) => void
}

interface ItemGridProps {
  items: Item[]
  loading?: boolean
  /**
   * How many items the loaded grid will hold, when the caller knows (a refetch of a view
   * already on screen). While loading, the grid then shows that many skeleton cards (or the
   * empty state for 0) and keeps its height. Leave unset when unknown: one row.
   */
  expectedCount?: number
  /**
   * Names what the grid is showing beyond its box: the active filter, for instance. The cards
   * fade in again when it changes. A change of `currentBoxId` always counts.
   */
  viewKey?: string
  /** Fade the cards in when the grid mounts already loaded, as a tab's content does. */
  fadeOnMount?: boolean
  currentBoxId: string | null
  onItemUpdate: () => void
  /** When set, the section title and Add Item button are shown on one row (title left, button right). */
  sectionTitle?: string
  /** Icon next to the section title (Lucide). Defaults to Sword. */
  sectionIcon?: LucideIcon
  /** Optional custom header content to render in place of the section title (e.g. tabs). */
  headerContent?: ReactNode
  /**
   * Sits between the title (or `headerContent`) and the add button from `md` up, where it takes
   * the free width of that row; below `md` it gets a line of its own under them. Pass it only
   * when it renders something, and keep it one fixed-height line (the tag quick-filter).
   */
  headerMiddle?: ReactNode
  /** When provided, use these for selection (dashboard); otherwise use internal useMarqueeSelection (wishlist, search). */
  selectionProps?: ItemGridSelectionProps
  /** When true, click only toggles selection; when false, click opens dialog (shift-click still toggles). */
  selectionMode?: boolean
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
  /** Empty-state content override. Stays inside the bordered section. */
  emptyText?: ReactNode
  /** Wishlist-only action. */
  onMarkAcquired?: (item: Item) => void
  /** Main wishlist page: ItemDialog stays in locked wishlist mode (no collection toggle). */
  wishlistDialogLocked?: boolean
  /** Public shared view: no add, dialog, selection/marquee, or paste bar. Prefer `capabilities`. */
  readOnly?: boolean
  capabilities?: CollectionCapabilities
}

export default function ItemGrid({
  items,
  loading = false,
  expectedCount,
  viewKey = "",
  fadeOnMount = false,
  currentBoxId,
  onItemUpdate,
  sectionTitle,
  sectionIcon: SectionIcon = Sword,
  headerContent,
  headerMiddle,
  selectionProps,
  selectionMode,
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
  capabilities,
}: ItemGridProps) {
  const resolvedCapabilities = capabilities ?? (readOnly ? READ_ONLY_CAPABILITIES : OWNER_CAPABILITIES)
  // Per-device preference. Comfortable on the server and until hydration has finished.
  const density = useCardDensity()
  const gridLayout = ITEM_GRID_LAYOUT[density]
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
    if (!selectionProps && resolvedCapabilities.canSelect) setSelectedIds(new Set())
  }, [currentBoxId, setSelectedIds, selectionProps, resolvedCapabilities.canSelect])

  const handleNewItem = () => {
    // Wishlist items do not count toward the cap. The dialog opens on one when it is locked to
    // the wishlist or defaults to it; switching it to a collection item is caught on save.
    const opensAsWishlistItem = wishlistDialogLocked || defaultNewItemMode === "wishlist"
    const atCap =
      !opensAsWishlistItem &&
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
    if (!resolvedCapabilities.canEdit && !resolvedCapabilities.canSelect) return
    if (resolvedCapabilities.canSelect && (selectionMode || e.shiftKey)) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(item.id)) next.delete(item.id)
        else next.add(item.id)
        return next
      })
      return
    }
    if (!resolvedCapabilities.canEdit) return
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

  const showAdd = showAddButton && resolvedCapabilities.canCreate
  const showOwnerChrome = resolvedCapabilities.canEdit || resolvedCapabilities.canDelete || resolvedCapabilities.canMove
  const skeletonItems =
    variant === "wishlist"
      ? WISHLIST_ITEM_SKELETON_FIXTURES
      : COLLECTION_ITEM_SKELETON_FIXTURES
  const skeletonName = getCardSkeletonName(
    variant === "wishlist" ? "item-grid-wishlist-card" : "item-grid-collection-card",
    density
  )
  // As many skeleton cards as items are expected; one row when that is not known.
  const displayedItems = loading ? takeLoadingFixtures(skeletonItems, gridLayout, expectedCount) : items
  // A view known to hold no items keeps its empty state through a refetch.
  const showEmpty = loading ? expectedCount === 0 : items.length === 0
  // Whatever replaces bones fades in, and so does a different view of the same grid (another
  // box, another filter). Bones themselves never fade, and an empty state that stays up through
  // a refetch keeps the same signal, so it does not flash.
  const showingBones = loading && !showEmpty
  const contentRef = useFadeOnChange<HTMLDivElement>(
    showingBones ? "bones" : `${showEmpty ? "empty" : "cards"}:${currentBoxId ?? "root"}:${viewKey}`,
    { enabled: !showingBones, onMount: fadeOnMount }
  )
  const showUsageStatus =
    variant === "collection" &&
    resolvedCapabilities.showItemCap &&
    !isPro &&
    itemCap !== null &&
    totalItemCount !== undefined
  const nearCap = showUsageStatus && totalItemCount >= itemCap - 5
  const remainingItems = showUsageStatus ? itemCap - totalItemCount : null

  return (
    <>
      <div className="rounded-md sk-outline bg-light-muted p-4">
        <div className={sectionTitle || headerContent ? "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-4 min-w-0" : "mb-4 min-w-0"}>
          {sectionTitle || headerContent ? (
            <>
              {headerContent ? (
                <div className="min-w-0">
                  {headerContent}
                </div>
              ) : (
                <h2 className="text-fluid-xl font-semibold flex items-center min-w-0 truncate">
                  <SectionIcon className="h-4 w-4 sm:h-5 sm:w-5 mr-2 shrink-0" />
                  {sectionTitle}
                </h2>
              )}
              {headerMiddle ? (
                <div className="order-last min-w-0 basis-full md:order-none md:flex-1 md:basis-0">
                  {headerMiddle}
                </div>
              ) : null}
              {showAdd ? addButton : null}
            </>
          ) : (
            showAdd ? addButton : null
          )}
        </div>
        <div ref={contentRef}>
        <div className={cn(gridLayout.gridClass, "relative")}>
          {displayedItems.map((item, index) => {
            const presented = presentOwnerItem(item)
            const fixtureCard = (
              <ItemCard
                item={presented}
                variant={variant}
                capabilities={resolvedCapabilities}
                density={density}
                onClick={() => {}}
                onMarkAcquired={variant === "wishlist" && resolvedCapabilities.canAcquire ? () => {} : undefined}
              />
            )

            const cardContent = loading ? (
              fixtureCard
            ) : variant === "collection" && resolvedCapabilities.canDrag ? (
              <DraggableItemCard
                item={item}
                selected={selectedIds.has(item.id)}
                selectionMode={selectionMode ?? false}
                onClick={handleItemClick}
                registerCardRef={registerCardRef}
                density={density}
              />
            ) : (
              <div
                ref={resolvedCapabilities.canSelect ? (el) => registerCardRef(item.id, el) : undefined}
                data-item-id={item.id}
              >
                <ItemCard
                  item={presented}
                  variant={variant}
                  capabilities={resolvedCapabilities}
                  selected={resolvedCapabilities.canSelect && selectedIds.has(item.id)}
                  selectionMode={resolvedCapabilities.canSelect && (selectionMode ?? false)}
                  density={density}
                  onClick={(_, event) => handleItemClick(item, event)}
                  onMarkAcquired={resolvedCapabilities.canAcquire && onMarkAcquired ? () => onMarkAcquired(item) : undefined}
                />
              </div>
            )

            const skeletonNode = (
              <Skeleton
                name={skeletonName}
                loading={loading}
                animate="shimmer"
                color="hsl(var(--muted))"
                darkColor="hsl(var(--muted))"
                fixture={fixtureCard}
              >
                {cardContent}
              </Skeleton>
            )

            if (loading) {
              return (
                <div key={`${item.id}-${index}`} className={getLoadingCardClass(gridLayout, index, expectedCount)}>
                  {skeletonNode}
                </div>
              )
            }

            return (
              <Skeleton
                key={item.id}
                name={skeletonName}
                loading={loading}
                animate="shimmer"
                color="hsl(var(--muted))"
                darkColor="hsl(var(--muted))"
                fixture={fixtureCard}
              >
                {cardContent}
              </Skeleton>
            )
          })}
        </div>
        {showEmpty && (
          <EmptyState
            figure={variant === "wishlist" ? "wishlist" : "items"}
            className={density === "compact" ? "min-h-[230px] py-8" : "min-h-[424px] py-12"}
          >
            {emptyText}
          </EmptyState>
        )}
        </div>
        {showUsageStatus && (
          <div className="mt-4 text-fluid-xs text-muted-foreground" role="status">
            <FadeOnChange signal={totalItemCount}>{totalItemCount}</FadeOnChange> of {itemCap} items used
            {nearCap && remainingItems !== null && remainingItems > 0 && (
              <span className="ml-2">
                — {remainingItems} item{remainingItems === 1 ? "" : "s"} left on free tier.{" "}
                <Link href="/settings?tab=billing" className="text-primary underline underline-offset-2 hover:no-underline">
                  Upgrade
                </Link>
              </span>
            )}
          </div>
        )}
      </div>
      {!loading && !selectionProps && resolvedCapabilities.canSelect && <MarqueeOverlay />}
      {variant === "collection" &&
        !loading &&
        !selectionProps &&
        showOwnerChrome &&
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
      {!loading && resolvedCapabilities.canEdit && (
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
