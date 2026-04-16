"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { createSupabaseClient } from "@/lib/supabase/client"
import { Box, Item, Tag, type Theme } from "@/lib/types"
import {
  DEFAULT_SEARCH_FILTERS,
  hasAnySearchFilter,
  type SearchFiltersState,
} from "@/lib/types"
import { buildSearchUrl, sortTagsByColorThenName } from "@/lib/utils"
import AdvancedSearchFilters from "@/components/advanced-search-filters"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Search, Trash2, Sword, Filter, Sparkle } from "lucide-react"
import { DndContext } from "@dnd-kit/core"
import { dashboardDndCollisionDetection } from "@/lib/dashboard-dnd-collision"
import { getItemDragId } from "@/components/draggable-item-card"
import BoxGrid from "@/components/box-grid"
import BoxStatsDialog from "@/components/box-stats-dialog"
import BoxStatsPanel from "@/components/box-stats-panel"
import ItemGrid from "@/components/item-grid"
import MoveToParentZone from "@/components/move-to-parent-zone"
import Breadcrumbs from "@/components/breadcrumbs"
import { useDashboardSelection } from "@/lib/hooks/use-dashboard-selection"
import { SelectionModeToggle } from "@/components/selection-mode-toggle"
import { SelectionActionBar } from "@/components/selection-action-bar"
import { useCopiedItem } from "@/lib/copied-item-context"
import UpsellModal from "@/components/upsell-modal"
import { FREE_TIER_CAP } from "@/lib/subscription"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import MarkAcquiredDialog from "@/components/mark-acquired-dialog"
import { useLiveSubscription } from "@/lib/hooks/use-live-subscription"
import { useDashboardData } from "@/lib/hooks/use-dashboard-data"
import { useDashboardDialogs } from "@/lib/hooks/use-dashboard-dialogs"
import { useDashboardDnd } from "@/lib/hooks/use-dashboard-dnd"

const DASHBOARD_DND_CONTEXT_ID = "dashboard-dnd-context"

interface DashboardClientProps {
  user: any
  /** Theme (color_scheme) from user_settings; not used for graph overlay. */
  initialTheme?: Theme | null
  /** Chart overlay preference from user_settings (separate from theme). */
  initialGraphOverlay?: boolean
  isPro?: boolean
  subscriptionStatus?: "active" | "canceled" | "past_due" | null
  /** ISO timestamp: end of Pro access during past_due grace */
  pastDueGraceEndsAt?: string | null
  itemCount?: number
  /** null when Pro (unlimited) */
  itemCap?: number | null
  freeTierCap?: number
  /** From user_settings — when true, never show the one-time demo offer. */
  demoPromptDismissed?: boolean
  initialBoxes?: Box[]
  initialItems?: Item[]
  initialUserTags?: Tag[]
}

export default function DashboardClient({
  user,
  initialTheme,
  initialGraphOverlay = true,
  isPro = false,
  subscriptionStatus = null,
  pastDueGraceEndsAt: pastDueGraceEndsAtProp = null,
  itemCount = 0,
  itemCap = null,
  freeTierCap = FREE_TIER_CAP,
  demoPromptDismissed = false,
  initialBoxes = [],
  initialItems = [],
  initialUserTags = [],
}: DashboardClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createSupabaseClient()

  // Post-payment confirmation banner
  const [showUpgradedBanner, setShowUpgradedBanner] = useState(
    () => searchParams.get("upgraded") === "true"
  )
  const [currentBoxId, setCurrentBoxId] = useState<string | null>(null)
  const [currentBox, setCurrentBox] = useState<Box | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const {
    boxes,
    items,
    unacquiredItems,
    userTags,
    loading,
    folderLoading,
    loadBoxes,
    loadItems,
    setUserTags,
  } = useDashboardData({
    userId: user?.id,
    supabase,
    currentBoxId,
    searchQuery,
    initialBoxes,
    initialItems,
    initialUserTags,
  })
  const [activeItemsTab, setActiveItemsTab] = useState<"items" | "unacquired">("items")
  const {
    editBox,
    setEditBox,
    editBoxName,
    setEditBoxName,
    editBoxDescription,
    setEditBoxDescription,
    showEditBoxDialog,
    setShowEditBoxDialog,
    savingEditBox,
    setSavingEditBox,
    deleteMode,
    setDeleteMode,
    deleteConfirmName,
    setDeleteConfirmName,
    deletingBox,
    setDeletingBox,
    showDemoOfferDialog,
    setShowDemoOfferDialog,
    demoSeedLoading,
    setDemoSeedLoading,
    demoSeedError,
    setDemoSeedError,
    itemToMark,
    setItemToMark,
    markingAcquired,
    setMarkingAcquired,
    showItemCapUpsell,
    setShowItemCapUpsell,
    openEditBox,
  } = useDashboardDialogs()
  const [statsBoxId, setStatsBoxId] = useState<string>("root")
  const [statsBoxName, setStatsBoxName] = useState<string>("Root")
  const [showStatsDialog, setShowStatsDialog] = useState(false)
  const [statsRefreshKey, setStatsRefreshKey] = useState(0)
  const [searchFilters, setSearchFilters] = useState<SearchFiltersState>(DEFAULT_SEARCH_FILTERS)
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [selectionMode, setSelectionMode] = useState(false)
  const {
    liveItemCount,
    liveIsPro,
    liveSubscriptionStatus,
    livePastDueGraceEndsAt,
    pastDueGraceDays,
    refreshSubscriptionCounts,
  } = useLiveSubscription({
    itemCount,
    isPro,
    subscriptionStatus,
    pastDueGraceEndsAt: pastDueGraceEndsAtProp,
  })
  const {
    selectedItemIds,
    setSelectedItemIds,
    selectedBoxIds,
    setSelectedBoxIds,
    registerItemCardRef,
    registerBoxCardRef,
    handleMouseDown,
    marquee,
    MarqueeOverlay,
    clearSelection,
    hasSelection,
    toggleBoxSelection,
    isBoxSelected,
    isItemSelected,
    toggleItemSelection,
  } = useDashboardSelection(currentBoxId)
  const {
    dndMoveLoading,
    dndActiveId,
    setDndActiveId,
    sensors,
    handleDragEnd,
  } = useDashboardDnd({
    currentBoxId,
    currentBox,
    items,
    boxes,
    selectedItemIds,
    selectedBoxIds,
    loadItems,
    loadBoxes,
    bumpStatsRefreshKey: () => setStatsRefreshKey((k) => k + 1),
  })
  const itemDragActive = dndActiveId?.startsWith("item-") ?? false
  const contentSkeletonLoading = folderLoading || dndMoveLoading
  const { copiedItemRefs, copiedBoxRefs } = useCopiedItem()
  const selectedItems = useMemo(() => {
    const fromCollection = items.filter((i) => selectedItemIds.has(i.id))
    const fromUnacquired = unacquiredItems.filter((i) => selectedItemIds.has(i.id))
    return [...fromCollection, ...fromUnacquired]
  }, [items, unacquiredItems, selectedItemIds])

  const hasUnacquiredTab = !!currentBoxId && unacquiredItems.length > 0
  const itemsInActiveItemsGrid = hasUnacquiredTab && activeItemsTab === "unacquired" ? unacquiredItems : items
  const selectedBoxes = boxes.filter((b) => selectedBoxIds.has(b.id))
  const showSelectionBar =
    hasSelection ||
    !!copiedItemRefs?.itemIds?.length ||
    !!copiedBoxRefs?.rootBoxIds?.length

  useEffect(() => {
    if (unacquiredItems.length === 0) {
      setActiveItemsTab("items")
    }
  }, [unacquiredItems.length])

  useEffect(() => {
    if (demoPromptDismissed) {
      setShowDemoOfferDialog(false)
      return
    }
    if (loading || contentSkeletonLoading) return
    setShowDemoOfferDialog(true)
  }, [
    demoPromptDismissed,
    loading,
    contentSkeletonLoading,
  ])

  const createBox = async (name: string, description: string) => {
    if (!name.trim()) return

    try {
      const { data, error } = await supabase
        .from("boxes")
        .insert({
          name: name,
          description: description || null,
          user_id: user.id,
          parent_box_id: currentBoxId || null,
        })
        .select()
        .single()

      if (error) throw error
      await loadBoxes()
    } catch (error) {
      console.error("Error creating box:", error)
    }
  }

  const refreshCurrentBoxData = () => {
    loadItems(currentBoxId)
    loadBoxes()
    setStatsRefreshKey((k) => k + 1)
    void refreshSubscriptionCounts()
  }

  const handleDismissDemoOffer = async () => {
    setDemoSeedError(null)
    try {
      const res = await fetch("/api/demo/prompt/dismiss", { method: "POST" })
      const j = (await res.json()) as { error?: string }
      if (!res.ok) {
        throw new Error(j.error ?? "Failed to save preference")
      }
      setShowDemoOfferDialog(false)
      router.refresh()
    } catch (e) {
      setDemoSeedError(e instanceof Error ? e.message : "Something went wrong")
    }
  }

  const handleSeedDemo = async () => {
    if (!user?.id) return
    setDemoSeedError(null)
    setDemoSeedLoading(true)
    try {
      const res = await fetch("/api/demo/seed", { method: "POST" })
      const j = (await res.json()) as { error?: string }
      if (!res.ok) {
        if (res.status === 403 && j.error === "item_limit_reached") {
          setShowItemCapUpsell(true)
          throw new Error("Your plan’s item limit is reached.")
        }
        throw new Error(typeof j.error === "string" ? j.error : "Failed to generate demo")
      }
      setShowDemoOfferDialog(false)
      await Promise.all([
        supabase
          .from("tags")
          .select("*")
          .eq("user_id", user.id)
          .then(({ data }) => setUserTags(sortTagsByColorThenName(data ?? []))),
        loadBoxes(),
        loadItems(currentBoxId),
        refreshSubscriptionCounts(),
      ])
      router.refresh()
      setStatsRefreshKey((k) => k + 1)
    } catch (e) {
      setDemoSeedError(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setDemoSeedLoading(false)
    }
  }

  const handleMarkAsAcquiredConfirm = async (payload: {
    acquisitionDate: string
    acquisitionPrice: number | null
  }) => {
    if (!itemToMark) return
    const targetBoxId = itemToMark.wishlist_target_box_id ?? currentBoxId
    if (!targetBoxId) return

    setMarkingAcquired(true)
    try {
      const { error } = await supabase
        .from("items")
        .update({
          is_wishlist: false,
          acquisition_date: payload.acquisitionDate,
          acquisition_price: payload.acquisitionPrice,
          box_id: targetBoxId,
          wishlist_target_box_id: null,
        })
        .eq("id", itemToMark.id)
        .eq("user_id", user.id)

      if (error) throw error
      setItemToMark(null)
      refreshCurrentBoxData()
    } catch (error) {
      console.error("Error marking as acquired:", error)
    } finally {
      setMarkingAcquired(false)
    }
  }

  const handleBoxClick = (box: Box | null) => {
    if (!box) {
      setCurrentBoxId(null)
      setCurrentBox(null)
      return
    }
    setCurrentBoxId(box.id)
    setCurrentBox(box)
  }

  const saveEditBox = async () => {
    if (!editBox || !editBoxName.trim()) return
    setSavingEditBox(true)
    try {
      const { error } = await supabase
        .from("boxes")
        .update({
          name: editBoxName.trim(),
          description: editBoxDescription.trim() || null,
        })
        .eq("id", editBox.id)
        .eq("user_id", user.id)

      if (error) throw error
      if (currentBox?.id === editBox.id) {
        setCurrentBox({
          ...currentBox,
          name: editBoxName.trim(),
          description: editBoxDescription.trim() || undefined,
        })
      }
      setShowEditBoxDialog(false)
      setEditBox(null)
      loadBoxes()
    } catch (error) {
      console.error("Error renaming box:", error)
    } finally {
      setSavingEditBox(false)
    }
  }

  const deleteBox = async () => {
    if (!editBox || !deleteMode || deleteConfirmName.trim() !== editBox.name) return
    setDeletingBox(true)
    try {
      const res = await fetch("/api/boxes/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boxId: editBox.id, mode: deleteMode }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? "Failed to delete box")
      }
      if (currentBoxId === editBox.id) {
        setCurrentBoxId(editBox.parent_box_id ?? null)
        setCurrentBox(null)
      }
      setShowEditBoxDialog(false)
      setEditBox(null)
      setDeleteMode(null)
      setDeleteConfirmName("")
      loadBoxes()
      loadItems(currentBoxId === editBox.id ? (editBox.parent_box_id ?? null) : currentBoxId)
    } catch (e) {
      console.error("Error deleting box:", e)
    } finally {
      setDeletingBox(false)
    }
  }

  const ActiveItemsIcon = activeItemsTab === "unacquired" ? Sparkle : Sword
  const tabbedItemsHeader = (
    <div className="flex items-center gap-2 min-w-0">
      <ActiveItemsIcon className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
      <TabsList>
        <TabsTrigger value="items">Items</TabsTrigger>
        <TabsTrigger value="unacquired">
          Wishlist ({unacquiredItems.length} remaining)
        </TabsTrigger>
      </TabsList>
    </div>
  )

  return (
    <>
      <Dialog
        open={showDemoOfferDialog}
        onOpenChange={() => {
          /* Close only via explicit actions (buttons). */
        }}
      >
        <DialogContent
          className="sm:max-w-md min-w-0 [&>button]:hidden"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader className="min-w-0">
            <DialogTitle>Try a sample collection?</DialogTitle>
            <DialogDescription>
              We can add demo boxes, items, tags, photos, and value history so you can explore how
              ShrineKeep works. This adds demo data to your existing library, and you can edit or
              delete everything later.
            </DialogDescription>
          </DialogHeader>
          {demoSeedError ? (
            <p className="text-fluid-sm text-destructive layout-shrink-visible" role="alert">
              {demoSeedError}
            </p>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={handleDismissDemoOffer}
              disabled={demoSeedLoading}
            >
              No, don&apos;t show again
            </Button>
            <Button type="button" onClick={handleSeedDemo} disabled={demoSeedLoading}>
              {demoSeedLoading ? "Generating…" : "Yes, generate demo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Post-payment confirmation banner */}
      {showUpgradedBanner && (
        <div className="bg-green-50 border-b border-green-200 px-4 py-3 flex items-center justify-between text-fluid-sm text-green-800">
          <span>You&apos;re now Pro. Add unlimited items.</span>
          <button
            onClick={() => {
              setShowUpgradedBanner(false)
              router.replace("/dashboard")
            }}
            className="ml-4 opacity-70 hover:opacity-100"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* past_due warning banner */}
      {liveSubscriptionStatus === "past_due" && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 text-fluid-sm text-amber-800">
          {livePastDueGraceEndsAt ? (
            liveIsPro ? (
              <>
                Your payment failed. Pro access remains on for{" "}
                <strong>
                  {pastDueGraceDays} {pastDueGraceDays === 1 ? "day" : "days"}
                </strong>{" "}
                after your billing period ended, through{" "}
                <strong>
                  {new Date(livePastDueGraceEndsAt).toLocaleDateString(undefined, {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </strong>
                . Please update your payment method in{" "}
                <Link href="/settings?tab=billing" className="underline font-medium">
                  Settings → Billing
                </Link>
                .
              </>
            ) : (
              <>
                Your payment failed; your Pro grace period ended on{" "}
                <strong>
                  {new Date(livePastDueGraceEndsAt).toLocaleDateString(undefined, {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </strong>
                . Update your payment method in{" "}
                <Link href="/settings?tab=billing" className="underline font-medium">
                  Settings → Billing
                </Link>{" "}
                to restore Pro.
              </>
            )
          ) : (
            <>
              Your payment failed. Pro access may still be active for up to{" "}
              <strong>
                {pastDueGraceDays} {pastDueGraceDays === 1 ? "day" : "days"}
              </strong>{" "}
              after your billing period ends — please update your payment method in{" "}
              <Link href="/settings?tab=billing" className="underline font-medium">
                Settings → Billing
              </Link>
              .
            </>
          )}
        </div>
      )}

      <main
        className="container mx-auto px-4 py-8 layout-shrink-visible overscroll-y-contain"
        onMouseDown={handleMouseDown}
      >
        <DndContext
          id={DASHBOARD_DND_CONTEXT_ID}
          sensors={sensors}
          collisionDetection={dashboardDndCollisionDetection}
          onDragStart={({ active }) => setDndActiveId(String(active.id))}
          onDragEnd={(e) => {
            setDndActiveId(null)
            void handleDragEnd(e)
          }}
          onDragCancel={() => setDndActiveId(null)}
        >
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 min-w-0">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <Breadcrumbs
              currentBoxId={currentBoxId}
              onBoxClick={handleBoxClick}
              enableDropTargets={!loading && !contentSkeletonLoading}
              activeDragId={dndActiveId}
              selectedBoxIds={selectedBoxIds}
            />
          </div>
          <div
            className={`flex flex-col gap-2 min-w-0 w-full ${
              itemDragActive ? "pointer-events-none touch-none" : ""
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground shrink-0" />
                <Input
                  placeholder="Search items..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      router.push(buildSearchUrl(searchQuery.trim(), searchFilters))
                    }
                  }}
                  className="pl-10 w-full min-w-0"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => router.push(buildSearchUrl(searchQuery.trim(), searchFilters))}
                className="shrink-0"
                title="Search (optional: leave empty for all items)"
              >
                <Search className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAdvancedFilters((v) => !v)}
                className="shrink-0"
              >
                <Filter className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">Filters</span>
                {hasAnySearchFilter(searchFilters) ? ` (${[
                  searchFilters.includeTags.length,
                  searchFilters.excludeTags.length,
                  searchFilters.tagColors.length,
                  searchFilters.valueMin ? 1 : 0,
                  searchFilters.valueMax ? 1 : 0,
                  searchFilters.acquisitionMin ? 1 : 0,
                  searchFilters.acquisitionMax ? 1 : 0,
                  searchFilters.dateFrom ? 1 : 0,
                  searchFilters.dateTo ? 1 : 0,
                ].reduce((a, b) => a + b, 0)})` : ""}
              </Button>
            </div>
            {showAdvancedFilters && (
              <AdvancedSearchFilters
                filters={searchFilters}
                userTags={userTags}
                onFiltersChange={setSearchFilters}
                showClear={hasAnySearchFilter(searchFilters)}
                onClear={() => setSearchFilters(DEFAULT_SEARCH_FILTERS)}
                className="w-full min-w-0"
              />
            )}
            <Dialog
              open={showEditBoxDialog}
              onOpenChange={(open) => {
                setShowEditBoxDialog(open)
                if (!open) {
                  setEditBox(null)
                  setDeleteMode(null)
                  setDeleteConfirmName("")
                }
              }}
            >
              <DialogContent className="sm:max-w-[500px] min-w-0">
                <DialogHeader className="min-w-0">
                  <DialogTitle>Rename box</DialogTitle>
                  <DialogDescription>
                    Change the name and description of this box, or delete it.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4 layout-shrink-visible">
                  <div className="min-w-0">
                    <Label>Name</Label>
                    <Input
                      value={editBoxName}
                      onChange={(e) => setEditBoxName(e.target.value)}
                      placeholder="My Collection"
                    />
                  </div>
                  <div className="min-w-0">
                    <Label>Description (optional)</Label>
                    <Input
                      value={editBoxDescription}
                      onChange={(e) => setEditBoxDescription(e.target.value)}
                      placeholder="A brief description..."
                    />
                  </div>

                  <div className="border-t pt-4 space-y-3 layout-shrink-visible">
                    <div className="flex items-center gap-2 text-fluid-sm font-medium text-destructive">
                      <Trash2 className="h-4 w-4" />
                      Delete box
                    </div>
                    {deleteMode == null ? (
                      <div className="flex flex-col gap-2 layout-shrink-visible">
                        <p className="text-fluid-sm text-muted-foreground">
                          Choose how to handle contents:
                        </p>
                        <div className="flex flex-col gap-2 layout-shrink-visible">
                          <Label htmlFor="delete-mode-delete-all" className="flex items-start gap-2 text-fluid-sm cursor-pointer min-w-0">
                            <input
                              id="delete-mode-delete-all"
                              type="radio"
                              name="delete-mode"
                              checked={deleteMode === "delete-all"}
                              onChange={() => setDeleteMode("delete-all")}
                              className="mt-1"
                            />
                            <span className="layout-shrink-visible">
                              <strong>Delete all:</strong> Permanently delete this box and all child items, sub-boxes, and their data (value history, photos, etc.).
                            </span>
                          </Label>
                          <Label htmlFor="delete-mode-move-to-root" className="flex items-start gap-2 text-fluid-sm cursor-pointer min-w-0">
                            <input
                              id="delete-mode-move-to-root"
                              type="radio"
                              name="delete-mode"
                              checked={deleteMode === "move-to-root"}
                              onChange={() => setDeleteMode("move-to-root")}
                              className="mt-1"
                            />
                            <span className="layout-shrink-visible">
                              <strong>Move to root:</strong> Move all child items and sub-boxes to the root level, then delete this box.
                            </span>
                          </Label>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3 layout-shrink-visible">
                        <p className="text-fluid-sm text-muted-foreground">
                          {deleteMode === "delete-all"
                            ? "All contents will be permanently deleted. This cannot be undone."
                            : "Child boxes and items will become root-level, then this box will be removed."}
                        </p>
                        <div className="layout-shrink-visible">
                          <Label className="text-fluid-sm font-medium min-w-0">
                            Type the box name to confirm: <strong className="break-all">{editBox?.name}</strong>
                          </Label>
                          <Input
                            value={deleteConfirmName}
                            onChange={(e) => setDeleteConfirmName(e.target.value)}
                            placeholder="Box name"
                            className="mt-1"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setDeleteMode(null)
                              setDeleteConfirmName("")
                            }}
                          >
                            Back
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={deleteBox}
                            disabled={
                              deletingBox ||
                              deleteConfirmName.trim() !== (editBox?.name ?? "")
                            }
                          >
                            {deletingBox ? "Deleting..." : "Confirm delete"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setShowEditBoxDialog(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={saveEditBox}
                    disabled={savingEditBox || !editBoxName.trim() || deleteMode != null}
                  >
                    {savingEditBox ? "Saving..." : "Save"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {loading ? (
          <>
            <BoxStatsPanel
              boxId={currentBoxId ?? "root"}
              boxName={currentBox?.name ?? "Root"}
              refreshKey={statsRefreshKey}
              graphOverlay={initialGraphOverlay}
            />
            <BoxGrid
              loading
              boxes={[]}
              currentBoxId={currentBoxId}
              onBoxClick={handleBoxClick}
              onRename={openEditBox}
              onShowStats={() => {}}
              onCreateBox={createBox}
              isBoxSelected={isBoxSelected}
              toggleBoxSelection={toggleBoxSelection}
              selectionMode={selectionMode}
              onEnterSelectionMode={() => setSelectionMode(true)}
              registerBoxCardRef={registerBoxCardRef}
            />
            <ItemGrid
              loading
              items={[]}
              currentBoxId={currentBoxId}
              onItemUpdate={refreshCurrentBoxData}
              sectionTitle="Items"
              selectionMode={selectionMode}
              onEnterSelectionMode={() => setSelectionMode(true)}
              selectionProps={{
                selectedIds: selectedItemIds,
                setSelectedIds: setSelectedItemIds,
                registerCardRef: registerItemCardRef,
              }}
              totalItemCount={liveItemCount}
              itemCap={itemCap}
              isPro={liveIsPro}
              onCapReached={() => setShowItemCapUpsell(true)}
            />
          </>
        ) : (
          <>
            <BoxStatsPanel
              boxId={currentBoxId ?? "root"}
              boxName={currentBox?.name ?? "Root"}
              refreshKey={statsRefreshKey}
              graphOverlay={initialGraphOverlay}
            />

            <BoxGrid
              boxes={boxes}
              loading={contentSkeletonLoading}
              currentBoxId={currentBoxId}
              onBoxClick={handleBoxClick}
              onRename={openEditBox}
              onShowStats={(box) => {
                setStatsBoxId(box.id)
                setStatsBoxName(box.name)
                setShowStatsDialog(true)
              }}
              onCreateBox={createBox}
              isBoxSelected={isBoxSelected}
              toggleBoxSelection={toggleBoxSelection}
              selectionMode={selectionMode}
              onEnterSelectionMode={() => setSelectionMode(true)}
              registerBoxCardRef={registerBoxCardRef}
            />
            {currentBox != null && (
              <div className="mb-6">
                <MoveToParentZone
                  isRoot={!currentBox.parent_box_id}
                />
              </div>
            )}
            <div>
              {searchQuery.trim() && items.length === 0 && !contentSkeletonLoading ? (
                <div className="text-center py-12 space-y-3 layout-shrink-visible">
                  <h2 className="text-fluid-xl font-semibold flex items-center mb-4 min-w-0 truncate">
                    <Sword className="h-4 w-4 sm:h-5 sm:w-5 mr-2 shrink-0" />
                    Items
                  </h2>
                  <p className="text-fluid-sm text-muted-foreground">
                    No items in this box.{" "}
                    <Link
                      href={buildSearchUrl(searchQuery.trim(), searchFilters)}
                      className="text-primary font-medium underline underline-offset-2 hover:no-underline"
                    >
                      Search all items
                    </Link>
                  </p>
                  <p className="text-fluid-sm text-muted-foreground">
                    Or press Enter in the search box to see all matching items.
                  </p>
                </div>
              ) : (
                currentBoxId && unacquiredItems.length > 0 ? (
                  <Tabs
                    value={activeItemsTab}
                    onValueChange={(v) => setActiveItemsTab(v as "items" | "unacquired")}
                  >
                    <TabsContent value="items">
                      <ItemGrid
                        items={items}
                        loading={contentSkeletonLoading}
                        currentBoxId={currentBoxId}
                        onItemUpdate={refreshCurrentBoxData}
                        headerContent={tabbedItemsHeader}
                        selectionMode={selectionMode}
                        onEnterSelectionMode={() => setSelectionMode(true)}
                        selectionProps={{
                          selectedIds: selectedItemIds,
                          setSelectedIds: setSelectedItemIds,
                          registerCardRef: registerItemCardRef,
                        }}
                        totalItemCount={liveItemCount}
                        itemCap={itemCap}
                        isPro={liveIsPro}
                        onCapReached={() => setShowItemCapUpsell(true)}
                      />
                    </TabsContent>
                    <TabsContent value="unacquired">
                      <ItemGrid
                        items={unacquiredItems}
                        loading={contentSkeletonLoading}
                        currentBoxId={currentBoxId}
                        onItemUpdate={refreshCurrentBoxData}
                        headerContent={tabbedItemsHeader}
                        variant="wishlist"
                        addButtonLabel="New Wishlist Item"
                        defaultNewItemMode="wishlist"
                        emptyText='No wishlist items in this box yet. Click "New Wishlist Item" to add one linked to this box.'
                        selectionMode={selectionMode}
                        onEnterSelectionMode={() => setSelectionMode(true)}
                        selectionProps={{
                          selectedIds: selectedItemIds,
                          setSelectedIds: setSelectedItemIds,
                          registerCardRef: registerItemCardRef,
                        }}
                        totalItemCount={liveItemCount}
                        itemCap={itemCap}
                        isPro={liveIsPro}
                        onCapReached={() => setShowItemCapUpsell(true)}
                        onMarkAcquired={(item) => setItemToMark(item)}
                      />
                    </TabsContent>
                  </Tabs>
                ) : (
                  <ItemGrid
                    items={items}
                    loading={contentSkeletonLoading}
                    currentBoxId={currentBoxId}
                    onItemUpdate={refreshCurrentBoxData}
                    sectionTitle="Items"
                    selectionMode={selectionMode}
                    onEnterSelectionMode={() => setSelectionMode(true)}
                    selectionProps={{
                      selectedIds: selectedItemIds,
                      setSelectedIds: setSelectedItemIds,
                      registerCardRef: registerItemCardRef,
                    }}
                    totalItemCount={liveItemCount}
                    itemCap={itemCap}
                    isPro={liveIsPro}
                    onCapReached={() => setShowItemCapUpsell(true)}
                  />
                )
              )}
            </div>
          </>
        )}

        <BoxStatsDialog
          boxId={statsBoxId}
          boxName={statsBoxName}
          open={showStatsDialog}
          onOpenChange={setShowStatsDialog}
          graphOverlay={initialGraphOverlay}
        />
        <SelectionModeToggle
          selectionMode={selectionMode}
          onEnterSelectionMode={() => setSelectionMode(true)}
          onExitSelectionMode={() => setSelectionMode(false)}
          actionBarVisible={showSelectionBar}
          onSelectAllItems={() => {
            setSelectedItemIds((prev) => {
              const next = new Set(prev)
              for (const i of itemsInActiveItemsGrid) {
                next.add(i.id)
              }
              return next
            })
          }}
          onSelectAllBoxes={() => setSelectedBoxIds(new Set(boxes.map((b) => b.id)))}
          itemCount={itemsInActiveItemsGrid.length}
          boxCount={boxes.length}
        />
        {showSelectionBar && (
          <SelectionActionBar
            selectedItems={selectedItems}
            selectedBoxes={selectedBoxes}
            pasteTarget={
              currentBoxId
                ? { boxId: currentBoxId, isWishlist: false, preserveItemKindsInBox: true }
                : { boxId: null, isWishlist: false }
            }
            onDeleteDone={refreshCurrentBoxData}
            onPasteDone={refreshCurrentBoxData}
            onClearSelection={clearSelection}
            onExitSelectionMode={() => setSelectionMode(false)}
            onItemCapReached={() => setShowItemCapUpsell(true)}
            totalItemCount={liveItemCount}
            itemCap={itemCap}
            isPro={liveIsPro}
          />
        )}
        <MarkAcquiredDialog
          item={itemToMark}
          open={!!itemToMark}
          loading={markingAcquired}
          onOpenChange={(open) => !open && setItemToMark(null)}
          onConfirm={handleMarkAsAcquiredConfirm}
        />
        <MarqueeOverlay />
        <UpsellModal
          open={showItemCapUpsell}
          onOpenChange={setShowItemCapUpsell}
          reason="cap_hit"
        />
        </DndContext>
      </main>
    </>
  )
}
