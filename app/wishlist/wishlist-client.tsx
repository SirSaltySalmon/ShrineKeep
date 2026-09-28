"use client"

import { useState, useEffect } from "react"
import { createSupabaseClient } from "@/lib/supabase/client"
import { Item } from "@/lib/types"
import { normalizeItem } from "@/lib/utils"
import { useMarqueeSelection } from "@/lib/hooks/use-marquee-selection"
import { SelectionModeToggle } from "@/components/selection-mode-toggle"
import { WishlistSharingPanel } from "@/components/wishlist-sharing-panel"
import { GuestWishlistPreview } from "@/components/wishlist/guest-preview"
import { PRIVATE_SHARING_DEFAULTS, type SharingSettings } from "@/lib/sharing/contracts"
import ItemGrid from "@/components/item-grid"
import { SelectionActionBar } from "@/components/selection-action-bar"
import { useCopiedItem } from "@/lib/copied-item-context"
import MarkAcquiredDialog from "@/components/mark-acquired-dialog"
import { Sparkle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAgentSuggestions } from "@/lib/hooks/use-agent-suggestions"
import AgentSuggestionReviewDialog from "@/components/agent-suggestion-review-dialog"
import AgentStagingInbox from "@/components/agent-staging-inbox"
import WebMcpStatusPanel from "@/components/webmcp-status-panel"

interface WishlistClientProps {
  aiWidgetVisible?: boolean
  userId: string
  initialWishlistLinkEnabled: boolean
  initialWishlistShareToken: string | null
  initialWishlistApplyColors: boolean
  initialRoot: SharingSettings
  initialNickname: string | null
  initialBio: string
  initialProfileShareStyle: boolean
  initialSharingRevision: string
  initialVisibleCount: number
  initialTotalCount: number
}

export default function WishlistClient({
  aiWidgetVisible = true,
  userId,
  initialWishlistLinkEnabled,
  initialWishlistShareToken,
  initialWishlistApplyColors,
  initialRoot,
  initialNickname,
  initialBio,
  initialProfileShareStyle,
  initialSharingRevision,
  initialVisibleCount,
  initialTotalCount,
}: WishlistClientProps) {
  const supabase = createSupabaseClient()
  const { copiedItemRefs, copiedBoxRefs } = useCopiedItem()
  const {
    selectedItemIds,
    setSelectedItemIds,
    registerItemCardRef,
    handleMouseDown: handleGridMouseDown,
    MarqueeOverlay,
  } = useMarqueeSelection()
  const [selectionMode, setSelectionMode] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [itemToMark, setItemToMark] = useState<Item | null>(null)
  const [marking, setMarking] = useState(false)
  const [wishlistLinkEnabled, setWishlistLinkEnabled] = useState(initialWishlistLinkEnabled)
  const [wishlistShareToken, setWishlistShareToken] = useState<string | null>(initialWishlistShareToken)
  const [wishlistApplyColors, setWishlistApplyColors] = useState(initialWishlistApplyColors)
  const [root, setRoot] = useState<SharingSettings>(initialRoot ?? PRIVATE_SHARING_DEFAULTS)
  const [sharingRevision, setSharingRevision] = useState(initialSharingRevision)
  const [visibleCount, setVisibleCount] = useState(initialVisibleCount)
  const [totalCount, setTotalCount] = useState(initialTotalCount)
  const [savingSharing, setSavingSharing] = useState(false)
  const [previewing, setPreviewing] = useState(false)

  useEffect(() => {
    loadWishlistItems()
  }, [])

  useEffect(() => {
    setWishlistLinkEnabled(initialWishlistLinkEnabled)
    setWishlistShareToken(initialWishlistShareToken)
    setWishlistApplyColors(initialWishlistApplyColors)
    setRoot(initialRoot)
    setSharingRevision(initialSharingRevision)
    setVisibleCount(initialVisibleCount)
    setTotalCount(initialTotalCount)
  }, [initialWishlistLinkEnabled, initialWishlistShareToken, initialWishlistApplyColors, initialRoot, initialSharingRevision, initialVisibleCount, initialTotalCount])

  const restoreSharing = () => {
    setWishlistLinkEnabled(initialWishlistLinkEnabled)
    setRoot(initialRoot)
    setWishlistApplyColors(initialWishlistApplyColors)
  }

  const saveOwnerSharing = async () => {
    setSavingSharing(true)
    try {
      const res = await fetch("/api/settings/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: initialNickname,
          bio: initialBio,
          profileShareStyle: initialProfileShareStyle,
          root,
          wishlistLinkEnabled,
          wishlistShareToken: null,
          expectedRevision: sharingRevision,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: { code?: string } })?.error?.code === "revision_conflict"
        ? "Sharing settings changed in another tab. Reload and try again."
        : "Failed to save sharing settings")
      const next = data as {
        revision?: string
        wishlistShareToken?: string | null
        wishlistGuestVisibleCount?: number
        wishlistGuestTotalCount?: number
      }
      if (next.revision) setSharingRevision(next.revision)
      if (next.wishlistShareToken !== undefined) setWishlistShareToken(next.wishlistShareToken)
      if (typeof next.wishlistGuestVisibleCount === "number") setVisibleCount(next.wishlistGuestVisibleCount)
      if (typeof next.wishlistGuestTotalCount === "number") setTotalCount(next.wishlistGuestTotalCount)
    } finally {
      setSavingSharing(false)
    }
  }

  const loadWishlistItems = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

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
        .order("created_at", { ascending: false })

      if (error) throw error
      setItems((data || []).map(normalizeItem))
    } catch (error) {
      console.error("Error loading wishlist:", error)
    } finally {
      setLoading(false)
    }
  }

  const openMarkAsAcquired = (item: Item) => {
    setItemToMark(item)
  }

  const selectedItems = items.filter((i) => selectedItemIds.has(i.id))
  const agentSuggestions = useAgentSuggestions({
    userId,
    page: "wishlist",
    selectedItems,
    onApplied: loadWishlistItems,
  })
  const wishlistActionBarVisible =
    !previewing && (
      selectedItems.length > 0 ||
      !!copiedItemRefs?.itemIds?.length ||
      !!copiedBoxRefs?.rootBoxIds?.length
    )
  const hasUnsavedSharingDraft =
    wishlistLinkEnabled !== initialWishlistLinkEnabled ||
    JSON.stringify(root) !== JSON.stringify(initialRoot)

  const handleMarkAsAcquiredConfirm = async (payload: {
    acquisitionDate: string
    acquisitionPrice: number | null
  }) => {
    if (!itemToMark) return
    setMarking(true)
    try {
      const { error } = await supabase
        .from("items")
        .update({
          is_wishlist: false,
          acquisition_date: payload.acquisitionDate,
          acquisition_price: payload.acquisitionPrice,
          box_id: itemToMark.wishlist_target_box_id ?? null,
          wishlist_target_box_id: null,
        })
        .eq("id", itemToMark.id)

      if (error) throw error
      setItemToMark(null)
      loadWishlistItems()
    } catch (error) {
      console.error("Error marking as acquired:", error)
    } finally {
      setMarking(false)
    }
  }

  return (
    <div className="min-h-screen bg-background min-w-0 overflow-hidden">
      <main
        className="container mx-auto px-4 py-8 min-w-0 overflow-hidden layout-shrink-visible"
        onMouseDown={previewing ? undefined : handleGridMouseDown}
      >
        <h1 className="sr-only">Wishlist</h1>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-fluid-sm text-muted-foreground">
            {previewing ? "Public preview of saved sharing settings." : null}
          </p>
          <Button type="button" variant={previewing ? "secondary" : "outline"} onClick={() => setPreviewing((current) => !current)}>
            {previewing ? "Exit preview" : "Preview public wishlist"}
          </Button>
        </div>
        {previewing ? (
          <GuestWishlistPreview
            sessionOwnerId={userId}
            profileShareStyle={initialProfileShareStyle}
            visibleCount={visibleCount}
            totalCount={totalCount}
            hasUnsavedSharingDraft={hasUnsavedSharingDraft}
          />
        ) : (
          <>
            <WebMcpStatusPanel page="wishlist" visible={aiWidgetVisible} {...agentSuggestions.webMcp} />
            <ItemGrid
              loading={loading}
              items={items}
              currentBoxId={null}
              onItemUpdate={loadWishlistItems}
              sectionTitle="Wishlist"
              sectionIcon={Sparkle}
              addButtonLabel="Add to Wishlist"
              variant="wishlist"
              emptyText="Your wishlist is empty. Add items you want to acquire!"
              onMarkAcquired={openMarkAsAcquired}
              wishlistDialogLocked={true}
              selectionMode={selectionMode}
              selectionProps={{
                selectedIds: selectedItemIds,
                setSelectedIds: setSelectedItemIds,
                registerCardRef: registerItemCardRef,
              }}
            />
            {!loading && wishlistActionBarVisible && (
              <SelectionActionBar
                selectedItems={selectedItems}
                pasteTarget={{ boxId: null, isWishlist: true }}
                onDeleteDone={loadWishlistItems}
                onPasteDone={loadWishlistItems}
                onClearSelection={() => setSelectedItemIds(new Set())}
                onExitSelectionMode={() => setSelectionMode(false)}
              />
            )}
            {!loading && (
              <SelectionModeToggle
                selectionMode={selectionMode}
                onEnterSelectionMode={() => setSelectionMode(true)}
                onExitSelectionMode={() => setSelectionMode(false)}
                actionBarVisible={wishlistActionBarVisible}
                onSelectAllItems={() => {
                  setSelectedItemIds((prev) => {
                    const next = new Set(prev)
                    for (const i of items) next.add(i.id)
                    return next
                  })
                }}
                itemCount={items.length}
              />
            )}
            {!loading && (
              <MarkAcquiredDialog
                item={itemToMark}
                open={!!itemToMark}
                loading={marking}
                onOpenChange={(open) => !open && setItemToMark(null)}
                onConfirm={handleMarkAsAcquiredConfirm}
              />
            )}
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
              actionBarVisible={wishlistActionBarVisible}
              onExpandedChange={agentSuggestions.setInboxExpanded}
              onReview={agentSuggestions.reviewStage}
              onDiscard={agentSuggestions.discardStage}
            />
            {!loading && <MarqueeOverlay />}
          </>
        )}

        {!loading && (
          <div className="mt-8 w-full flex justify-center">
            <div className="mt-8 w-full max-w-2xl mx-auto">
              <WishlistSharingPanel
                layout="card"
                wishlistLinkEnabled={wishlistLinkEnabled}
                wishlistShareToken={wishlistShareToken}
                wishlistApplyColors={wishlistApplyColors}
                onLinkEnabledChange={setWishlistLinkEnabled}
                onApplyColorsChange={setWishlistApplyColors}
                onShareTokenChange={setWishlistShareToken}
                visibleCount={visibleCount}
                totalCount={totalCount}
                onSaveSharing={saveOwnerSharing}
                onCancelSharing={restoreSharing}
                savingSharing={savingSharing}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
