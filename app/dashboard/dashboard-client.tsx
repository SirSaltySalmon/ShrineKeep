"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { createSupabaseClient } from "@/lib/supabase/client"
import { Box, Item, Tag, type Theme } from "@/lib/types"
import {
  DEFAULT_SEARCH_FILTERS,
  hasAnySearchFilter,
  type SearchFiltersState,
} from "@/lib/types"
import {
  buildSearchUrl,
  getLocalItemSearchEmptyCopy,
  itemMatchesLocalSearch,
  sortTagsByColorThenName,
} from "@/lib/utils"
import AdvancedSearchFilters from "@/components/advanced-search-filters"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Search, Sword, Filter, Sparkle } from "lucide-react"
import { DndContext } from "@dnd-kit/core"
import { dashboardDndCollisionDetection } from "@/lib/dashboard-dnd-collision"
import { getItemDragId } from "@/components/draggable-item-card"
import BoxGrid from "@/components/box-grid"
import BoxDialog from "@/components/box-dialog"
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
import { useMobileSafariDragGuard } from "@/lib/hooks/use-mobile-safari-drag-guard"
import { useAgentSuggestions } from "@/lib/hooks/use-agent-suggestions"
import AgentSuggestionReviewDialog from "@/components/agent-suggestion-review-dialog"
import WebMcpStatusPanel from "@/components/webmcp-status-panel"
import AgentStagingInbox from "@/components/agent-staging-inbox"
import { type DashboardOwnerSharing } from "@/lib/sharing/box-editor"
import { RootAudiencePanel } from "@/components/sharing/root-audience-panel"
import {
  coachStorageKey,
  initialCoachState,
  parseCoachState,
  reduceCoach,
  type CoachEvent,
  type CoachState,
} from "@/lib/webmcp/first-run-coach"
import { chooseFirstRun, coachToolsSettled } from "@/lib/webmcp/first-run-chooser"

const DASHBOARD_DND_CONTEXT_ID = "dashboard-dnd-context"

interface DashboardClientProps {
  aiWidgetVisible?: boolean
  tutorialResetAt?: string | null
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
  /** Tutorial completed or skipped; can be reset in Personal settings. */
  demoPromptDismissed?: boolean
  initialBoxes?: Box[]
  initialItems?: Item[]
  initialUserTags?: Tag[]
  initialDescendantCounts?: Record<string, number>
  initialOwnerSharing?: DashboardOwnerSharing
}

export default function DashboardClient({
  aiWidgetVisible = true,
  tutorialResetAt = null,
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
  initialDescendantCounts = {},
  initialOwnerSharing,
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
    descendantCounts,
    ownerSharing,
    items,
    unacquiredItems,
    userTags,
    loading,
    folderLoading,
    loadBoxes,
    loadItems,
    setUserTags,
    setOwnerSharing,
  } = useDashboardData({
    userId: user?.id,
    supabase,
    currentBoxId,
    searchQuery,
    initialBoxes,
    initialItems,
    initialUserTags,
    initialDescendantCounts,
    initialOwnerSharing,
  })
  const [activeItemsTab, setActiveItemsTab] = useState<"items" | "unacquired">("items")
  const {
    editBox,
    setEditBox,
    showEditBoxDialog,
    setShowEditBoxDialog,
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
  useMobileSafariDragGuard(dndActiveId !== null)
  const contentSkeletonLoading = folderLoading || dndMoveLoading
  const { copiedItemRefs, copiedBoxRefs } = useCopiedItem()
  const selectedItems = useMemo(() => {
    const fromCollection = items.filter((i) => selectedItemIds.has(i.id))
    const fromUnacquired = unacquiredItems.filter((i) => selectedItemIds.has(i.id))
    return [...fromCollection, ...fromUnacquired]
  }, [items, unacquiredItems, selectedItemIds])

  const visibleUnacquiredItems = useMemo(() => {
    const query = searchQuery.trim()
    if (!query) return unacquiredItems
    return unacquiredItems.filter((item) => itemMatchesLocalSearch(item, query))
  }, [unacquiredItems, searchQuery])

  const hasUnacquiredTab = !!currentBoxId && unacquiredItems.length > 0
  const itemsInActiveItemsGrid =
    hasUnacquiredTab && activeItemsTab === "unacquired" ? visibleUnacquiredItems : items
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

  const [coach, setCoach] = useState<CoachState>(() => initialCoachState(user.id))
  const [nameDraft, setNameDraft] = useState("")
  const [coachError, setCoachError] = useState<string | null>(null)
  const [coachBusy, setCoachBusy] = useState(false)
  const [checkElapsed, setCheckElapsed] = useState(0)
  const [firstRunConsumed, setFirstRunConsumed] = useState(false)
  const [showTutorialComplete, setShowTutorialComplete] = useState(false)

  useEffect(() => {
    const stored = parseCoachState(
      typeof sessionStorage === "undefined" ? null : sessionStorage.getItem(coachStorageKey(tutorialResetAt)),
      user.id
    )
    setCoach(stored)
    setNameDraft(stored.collectionName)
  }, [user.id, tutorialResetAt])

  const dispatchCoach = useCallback((event: CoachEvent) => {
    setCoach((prev) => {
      const next = reduceCoach(prev, event)
      try {
        sessionStorage.setItem(coachStorageKey(tutorialResetAt), JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }, [tutorialResetAt])

  useEffect(() => {
    const started = Date.now()
    const id = window.setInterval(() => setCheckElapsed(Date.now() - started), 250)
    return () => window.clearInterval(id)
  }, [user.id])

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

  const agentSuggestions = useAgentSuggestions({
    userId: user?.id,
    page: "dashboard",
    currentBoxId,
    currentBoxName: currentBox?.name ?? "Root",
    selectedItems,
    onApplied: refreshCurrentBoxData,
    onToolStart: (name) => dispatchCoach({ type: "tool_start", name }),
    onApplySuccess: (event) => dispatchCoach({ type: "apply_success", ...event }),
  })

  const firstRun = chooseFirstRun({
    dismissed: demoPromptDismissed || firstRunConsumed,
    coachTools: agentSuggestions.coachToolStatuses,
    elapsedMs: checkElapsed,
  })
  const webMcpAvailable = coachToolsSettled(agentSuggestions.coachToolStatuses) === "ready"

  useEffect(() => {
    if (demoPromptDismissed || firstRunConsumed) {
      setShowDemoOfferDialog(false)
    }
  }, [demoPromptDismissed, firstRunConsumed])

  useEffect(() => {
    dispatchCoach({ type: "box_opened", boxId: currentBoxId })
  }, [currentBoxId, dispatchCoach])

  const persistFirstRunConsumed = async () => {
    setCoachBusy(true)
    setCoachError(null)
    try {
      const res = await fetch("/api/demo/prompt/dismiss", { method: "POST" })
      const j = (await res.json()) as { error?: string }
      if (!res.ok) {
        throw new Error(j.error ?? "Failed to save preference")
      }
      setFirstRunConsumed(true)
      setShowDemoOfferDialog(false)
      router.refresh()
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong"
      setCoachError(message)
      setDemoSeedError(message)
      throw e
    } finally {
      setCoachBusy(false)
    }
  }

  const handleDismissDemoOffer = async () => {
    setDemoSeedError(null)
    try {
      await persistFirstRunConsumed()
    } catch {
      /* error already stored */
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
      setFirstRunConsumed(true)
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

  useEffect(() => {
    if (coach.step !== "done" || demoPromptDismissed || firstRunConsumed || coachError) return
    setShowTutorialComplete(true)
    void persistFirstRunConsumed().catch(() => setShowTutorialComplete(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coach.step, demoPromptDismissed, firstRunConsumed, coachError])

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

  const handleOpenEditBox = (box: Box) => {
    const latest = boxes.find((entry) => entry.id === box.id) ?? box
    openEditBox(latest)
  }

  const ActiveItemsIcon = activeItemsTab === "unacquired" ? Sparkle : Sword
  const localSearchEmptyCopy = getLocalItemSearchEmptyCopy(searchQuery, searchFilters)
  const localSearchEmptyText = localSearchEmptyCopy ? (
    <>
      No items in this box match your search.{" "}
      <Link
        href={localSearchEmptyCopy.href}
        className="text-primary font-medium underline underline-offset-2 hover:no-underline"
      >
        Search all items
      </Link>
      <span className="block mt-3">
        Or press Enter in the search box to see all matching items.
      </span>
    </>
  ) : undefined
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
              delete everything later. You can restart this tutorial in Settings → Personal.
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
        <div className="bg-[hsl(var(--value-color)/0.1)] border-b border-[hsl(var(--value-color)/0.2)] px-4 py-3 flex items-center justify-between text-fluid-sm text-[hsl(var(--value-color))]">
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
        <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-3 text-fluid-sm text-destructive">
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
          </div>
        </div>

        <WebMcpStatusPanel
          visible={aiWidgetVisible}
          page="dashboard"
          {...agentSuggestions.webMcp}
          coach={
            firstRun === "coach" && !showTutorialComplete
              ? {
                  state: coach,
                  nameDraft,
                  onNameDraft: setNameDraft,
                  onContinueName: () => dispatchCoach({ type: "set_name", name: nameDraft }),
                  onSkipStep: () =>
                    dispatchCoach({ type: "skip_step", boxId: currentBoxId, name: nameDraft }),
                  onSkip: () => void handleDismissDemoOffer(),
                  onSample: () => {
                    setDemoSeedError(null)
                    setShowDemoOfferDialog(true)
                  },
                  busy: coachBusy || demoSeedLoading,
                  error: coachError,
                  webMcpAvailable,
                }
              : undefined
          }
          completionNotice={showTutorialComplete}
          onDismissCompletion={() => setShowTutorialComplete(false)}
        />

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
              onRename={handleOpenEditBox}
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
              onRename={handleOpenEditBox}
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
              {currentBoxId && unacquiredItems.length > 0 ? (
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
                      emptyText={localSearchEmptyText}
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
                      items={visibleUnacquiredItems}
                      loading={contentSkeletonLoading}
                      currentBoxId={currentBoxId}
                      onItemUpdate={refreshCurrentBoxData}
                      headerContent={tabbedItemsHeader}
                      variant="wishlist"
                      addButtonLabel="New Wishlist Item"
                      defaultNewItemMode="wishlist"
                      emptyText={
                        searchQuery.trim()
                          ? "No wishlist items in this box match your search."
                          : 'No wishlist items in this box yet. Click "New Wishlist Item" to add one linked to this box.'
                      }
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
                  emptyText={localSearchEmptyText}
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
              )}
            </div>
          </>
        )}

        {!loading && currentBoxId == null && ownerSharing?.available && (
          <RootAudiencePanel
            ownerSharing={ownerSharing}
            onOwnerSharingChange={setOwnerSharing}
          />
        )}

        <BoxDialog
          open={showEditBoxDialog}
          onOpenChange={(open) => {
            setShowEditBoxDialog(open)
            if (!open) setEditBox(null)
          }}
          box={editBox}
          ownerSharing={ownerSharing}
          descendantCount={
            editBox
              ? descendantCounts[editBox.id] ?? editBox.descendant_count ?? 0
              : 0
          }
          onSave={(updated) => {
            if (currentBox?.id === updated.id) {
              setCurrentBox({
                ...currentBox,
                name: updated.name,
                description: updated.description || undefined,
                sharing: updated.sharing,
              })
            }
            loadBoxes()
          }}
          onDeleted={(box) => {
            if (currentBoxId === box.id) {
              setCurrentBoxId(box.parent_box_id ?? null)
              setCurrentBox(null)
            }
            loadBoxes()
            loadItems(currentBoxId === box.id ? (box.parent_box_id ?? null) : currentBoxId)
          }}
          onOwnerSharingChange={setOwnerSharing}
        />
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
        <AgentSuggestionReviewDialog
          key={agentSuggestions.batch?.id ?? "no-agent-suggestions"}
          batch={agentSuggestions.batch}
          open={agentSuggestions.open}
          applying={agentSuggestions.applying}
          error={agentSuggestions.error}
          onOpenChange={agentSuggestions.onOpenChange}
          onPersistReview={agentSuggestions.persistReview}
          onDiscard={agentSuggestions.discardStage}
          onApplyItemEdits={agentSuggestions.applyItemEdits}
          onApplyCreatedItems={agentSuggestions.applyCreatedItems}
          onApplyWishlistPriceEdits={agentSuggestions.applyWishlistPriceEdits}
        />
        <AgentStagingInbox
          batches={agentSuggestions.batches}
          expanded={agentSuggestions.inboxExpanded}
          actionBarVisible={showSelectionBar}
          onExpandedChange={agentSuggestions.setInboxExpanded}
          onReview={agentSuggestions.reviewStage}
          onDiscard={agentSuggestions.discardStage}
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
