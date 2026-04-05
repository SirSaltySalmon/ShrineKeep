"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { createSupabaseClient } from "@/lib/supabase/client"
import { Box, Item, Tag, type Theme } from "@/lib/types"
import {
  DEFAULT_SEARCH_FILTERS,
  hasAnySearchFilter,
  type SearchFiltersState,
} from "@/lib/types"
import { normalizeItem, buildSearchUrl, sortTagsByColorThenName } from "@/lib/utils"
import AdvancedSearchFilters from "@/components/advanced-search-filters"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Search, Trash2, Sword, Filter, Sparkle } from "lucide-react"
import { DndContext, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { getItemDragId } from "@/components/draggable-item-card"
import { getBoxDropId } from "@/components/droppable-box-card"
import { MOVE_TO_PARENT_ZONE_ID } from "@/components/move-to-parent-zone"
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
import { PAST_DUE_GRACE_DAYS } from "@/lib/subscription"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import MarkAcquiredDialog from "@/components/mark-acquired-dialog"

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
  freeTierCap = 50,
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
  const [boxes, setBoxes] = useState<Box[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [unacquiredItems, setUnacquiredItems] = useState<Item[]>([])
  const [activeItemsTab, setActiveItemsTab] = useState<"items" | "unacquired">("items")
  const [loading, setLoading] = useState(true)
  const [editBox, setEditBox] = useState<Box | null>(null)
  const [editBoxName, setEditBoxName] = useState("")
  const [editBoxDescription, setEditBoxDescription] = useState("")
  const [showEditBoxDialog, setShowEditBoxDialog] = useState(false)
  const [savingEditBox, setSavingEditBox] = useState(false)
  const [deleteMode, setDeleteMode] = useState<"delete-all" | "move-to-root" | null>(null)
  const [deleteConfirmName, setDeleteConfirmName] = useState("")
  const [deletingBox, setDeletingBox] = useState(false)
  const [statsBoxId, setStatsBoxId] = useState<string>("root")
  const [statsBoxName, setStatsBoxName] = useState<string>("Root")
  const [showStatsDialog, setShowStatsDialog] = useState(false)
  const [statsRefreshKey, setStatsRefreshKey] = useState(0)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchFilters, setSearchFilters] = useState<SearchFiltersState>(DEFAULT_SEARCH_FILTERS)
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [userTags, setUserTags] = useState<Tag[]>([])
  const [selectionMode, setSelectionMode] = useState(false)
  const [liveItemCount, setLiveItemCount] = useState(itemCount)
  const [showItemCapUpsell, setShowItemCapUpsell] = useState(false)
  const [itemToMark, setItemToMark] = useState<Item | null>(null)
  const [markingAcquired, setMarkingAcquired] = useState(false)
  const [liveIsPro, setLiveIsPro] = useState(isPro)
  const [liveSubscriptionStatus, setLiveSubscriptionStatus] = useState(subscriptionStatus)
  const [pastDueGraceEndsAt, setPastDueGraceEndsAt] = useState<string | null>(pastDueGraceEndsAtProp)
  const [pastDueGraceDays, setPastDueGraceDays] = useState(PAST_DUE_GRACE_DAYS)

  useEffect(() => {
    setLiveItemCount(itemCount)
  }, [itemCount])

  useEffect(() => {
    setLiveIsPro(isPro)
    setLiveSubscriptionStatus(subscriptionStatus)
    setPastDueGraceEndsAt(pastDueGraceEndsAtProp)
    setPastDueGraceDays(PAST_DUE_GRACE_DAYS)
  }, [isPro, subscriptionStatus, pastDueGraceEndsAtProp])

  const refreshSubscriptionCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/subscription")
      if (!res.ok) return
      const data = (await res.json()) as {
        itemCount?: number
        pastDueGraceEndsAt?: string | null
        pastDueGraceDays?: number
        isPro?: boolean
        status?: "active" | "canceled" | "past_due" | null
      }
      if (typeof data.itemCount === "number") {
        setLiveItemCount(data.itemCount)
      }
      if (data.pastDueGraceEndsAt !== undefined) {
        setPastDueGraceEndsAt(data.pastDueGraceEndsAt)
      }
      if (typeof data.pastDueGraceDays === "number") {
        setPastDueGraceDays(data.pastDueGraceDays)
      }
      if (typeof data.isPro === "boolean") {
        setLiveIsPro(data.isPro)
      }
      if (data.status !== undefined) {
        setLiveSubscriptionStatus(data.status)
      }
    } catch {
      /* ignore transient fetch errors */
    }
  }, [])

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
    loadBoxes()
  }, [currentBoxId])

  useEffect(() => {
    if (currentBoxId) {
      loadItems(currentBoxId)
    } else {
      loadItems(null)
    }
  }, [currentBoxId])

  useEffect(() => {
    if (unacquiredItems.length === 0) {
      setActiveItemsTab("items")
    }
  }, [unacquiredItems.length])

  useEffect(() => {
    if (!user?.id) return
    supabase
      .from("tags")
      .select("*")
      .eq("user_id", user.id)
      .then(({ data }) => setUserTags(sortTagsByColorThenName(data ?? [])))
  }, [user?.id, supabase])

  const loadBoxes = async () => {
    if (!user?.id) {
      setLoading(false)
      return
    }
    try {
      let query = supabase
        .from("boxes")
        .select("*")
        .eq("user_id", user.id)

      const parentId = currentBoxId && currentBoxId !== "null" ? currentBoxId : null
      if (parentId) {
        query = query.eq("parent_box_id", parentId)
      } else {
        query = query.is("parent_box_id", null)
      }

      const { data, error } = await query.order("position", { ascending: true })

      if (error) throw error
      setBoxes(data || [])
    } catch (error) {
      setBoxes([])
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null && "message" in error
            ? String((error as { message: unknown }).message)
            : String(error)
      console.error("Error loading boxes:", message, error)
    } finally {
      setLoading(false)
    }
  }

  const loadItems = async (boxId: string | null) => {
    try {
      let query = supabase
        .from("items")
        .select(`
          *,
          photos (*),
          item_tags (
            tag:tags (*)
          )
        `)
        .eq("user_id", user.id)
        .eq("is_wishlist", false)

      if (boxId) {
        query = query.eq("box_id", boxId)
      } else {
        query = query.is("box_id", null)
      }

      if (searchQuery) {
        query = query.or(`name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`)
      }

      const { data, error } = await query.order("position", { ascending: true })

      if (error) throw error
      setItems((data || []).map(normalizeItem))
      if (boxId) {
        await loadUnacquiredForBox(boxId)
      } else {
        setUnacquiredItems([])
      }
    } catch (error) {
      console.error("Error loading items:", error)
      setUnacquiredItems([])
    }
  }

  const loadUnacquiredForBox = async (boxId: string) => {
    try {
      const { data, error } = await supabase
        .from("items")
        .select(`
          *,
          photos (*),
          item_tags (
            tag:tags (*)
          )
        `)
        .eq("user_id", user.id)
        .eq("is_wishlist", true)
        .eq("wishlist_target_box_id", boxId)
        .order("created_at", { ascending: false })

      if (error) throw error
      setUnacquiredItems((data || []).map(normalizeItem))
    } catch (error) {
      console.error("Error loading unacquired items:", error)
      setUnacquiredItems([])
    }
  }

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

  const openEditBox = (box: Box) => {
    setEditBox(box)
    setEditBoxName(box.name)
    setEditBoxDescription(box.description ?? "")
    setDeleteMode(null)
    setDeleteConfirmName("")
    setShowEditBoxDialog(true)
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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    })
  )

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return

    const activeId = String(active.id)
    const overId = String(over.id)

    let targetParentBoxId: string | null = null
    if (overId === MOVE_TO_PARENT_ZONE_ID) {
      targetParentBoxId = currentBox?.parent_box_id ?? null
    } else if (overId.startsWith("box-")) {
      targetParentBoxId = overId.slice("box-".length)
    } else {
      return
    }

    if (activeId.startsWith("item-")) {
      const itemId = activeId.slice("item-".length)
      const draggedItem = active.data.current?.item as Item | undefined
      if (!draggedItem) return

      const currentItemBoxId = draggedItem.box_id ?? null
      if (currentItemBoxId === targetParentBoxId) return

      const moveItemIds =
        selectedItemIds.has(itemId) && selectedItemIds.size > 0
          ? items
              .filter((i) => selectedItemIds.has(i.id) && (i.box_id ?? null) === currentItemBoxId)
              .map((i) => i.id)
          : [itemId]

      if (moveItemIds.length === 0) return

      try {
        const res = await fetch("/api/items/move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemIds: moveItemIds, targetBoxId: targetParentBoxId }),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error ?? "Failed to move item")
        }
        loadItems(currentBoxId)
        loadBoxes()
        setStatsRefreshKey((k) => k + 1)
      } catch (e) {
        console.error("Error moving item:", e)
      }
      return
    }

    if (activeId.startsWith("box-drag-")) {
      const boxId = activeId.slice("box-drag-".length)
      const draggedBox = active.data.current?.box as Box | undefined
      if (!draggedBox) return

      if (targetParentBoxId !== null && selectedBoxIds.has(targetParentBoxId)) {
        return
      }

      const currentBoxParentId = draggedBox.parent_box_id ?? null
      const moveBoxIdsBase =
        selectedBoxIds.has(boxId) && selectedBoxIds.size > 0
          ? boxes
              .filter(
                (b) =>
                  selectedBoxIds.has(b.id) &&
                  (b.parent_box_id ?? null) === currentBoxParentId
              )
              .map((b) => b.id)
          : [boxId]

      const moveBoxIds = moveBoxIdsBase.filter((id) => id !== targetParentBoxId)
      if (moveBoxIds.length === 0) return

      try {
        const res = await fetch("/api/boxes/move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ boxIds: moveBoxIds, targetParentBoxId }),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error ?? "Failed to move box")
        }
        loadBoxes()
        loadItems(currentBoxId)
        setStatsRefreshKey((k) => k + 1)
      } catch (e) {
        console.error("Error moving box:", e)
      }
    }
  }


  useEffect(() => {
    loadItems(currentBoxId)
  }, [searchQuery])

  const nearCap = !liveIsPro && itemCap !== null && liveItemCount >= itemCap - 5
  const remainingItems = itemCap !== null ? itemCap - liveItemCount : null

  return (
    <>
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
          {pastDueGraceEndsAt ? (
            liveIsPro ? (
              <>
                Your payment failed. Pro access remains on for{" "}
                <strong>
                  {pastDueGraceDays} {pastDueGraceDays === 1 ? "day" : "days"}
                </strong>{" "}
                after your billing period ended, through{" "}
                <strong>
                  {new Date(pastDueGraceEndsAt).toLocaleDateString(undefined, {
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
                  {new Date(pastDueGraceEndsAt).toLocaleDateString(undefined, {
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

      <main className="container mx-auto px-4 py-8 layout-shrink-visible" onMouseDown={handleMouseDown}>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 min-w-0">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <Breadcrumbs currentBoxId={currentBoxId} onBoxClick={handleBoxClick} />
          </div>
          <div className="flex flex-col gap-2 min-w-0 w-full">
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
          <div className="text-center py-12 text-fluid-base text-muted-foreground">Loading...</div>
        ) : (
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <BoxStatsPanel
              boxId={currentBoxId ?? "root"}
              boxName={currentBox?.name ?? "Root"}
              refreshKey={statsRefreshKey}
              graphOverlay={initialGraphOverlay}
            />

            {/* Item cap counter (free tier only) */}
            {!liveIsPro && itemCap !== null && (
              <div className="mb-4 text-fluid-xs text-muted-foreground" role="status">
                {liveItemCount} of {itemCap} items used
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
            <BoxGrid
              boxes={boxes}
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
              {searchQuery.trim() && items.length === 0 ? (
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
                    <TabsList className="mb-4">
                      <TabsTrigger value="items">Items</TabsTrigger>
                      <TabsTrigger value="unacquired">
                        Wishlist ({unacquiredItems.length} remaining)
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="items">
                      <ItemGrid
                        items={items}
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
                    </TabsContent>
                    <TabsContent value="unacquired">
                      <ItemGrid
                        items={unacquiredItems}
                        currentBoxId={currentBoxId}
                        onItemUpdate={refreshCurrentBoxData}
                        sectionTitle="Wishlist"
                        sectionIcon={Sparkle}
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
          </DndContext>
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
      </main>
    </>
  )
}
