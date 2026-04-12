"use client"

import { useState, useEffect } from "react"
import { createSupabaseClient } from "@/lib/supabase/client"
import { Item } from "@/lib/types"
import { normalizeItem } from "@/lib/utils"
import { useMarqueeSelection } from "@/lib/hooks/use-marquee-selection"
import { SelectionModeToggle } from "@/components/selection-mode-toggle"
import { WishlistSharingPanel } from "@/components/wishlist-sharing-panel"
import ItemGrid from "@/components/item-grid"
import { SelectionActionBar } from "@/components/selection-action-bar"
import { useCopiedItem } from "@/lib/copied-item-context"
import MarkAcquiredDialog from "@/components/mark-acquired-dialog"
import { Sparkle } from "lucide-react"

interface WishlistClientProps {
  initialWishlistIsPublic: boolean
  initialWishlistShareToken: string | null
  initialWishlistApplyColors: boolean
}

export default function WishlistClient({
  initialWishlistIsPublic,
  initialWishlistShareToken,
  initialWishlistApplyColors,
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
  const [wishlistIsPublic, setWishlistIsPublic] = useState(initialWishlistIsPublic)
  const [wishlistShareToken, setWishlistShareToken] = useState<string | null>(initialWishlistShareToken)
  const [wishlistApplyColors, setWishlistApplyColors] = useState(initialWishlistApplyColors)

  useEffect(() => {
    loadWishlistItems()
  }, [])

  useEffect(() => {
    setWishlistIsPublic(initialWishlistIsPublic)
    setWishlistShareToken(initialWishlistShareToken)
    setWishlistApplyColors(initialWishlistApplyColors)
  }, [initialWishlistIsPublic, initialWishlistShareToken, initialWishlistApplyColors])

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
  const wishlistActionBarVisible =
    selectedItems.length > 0 ||
    !!copiedItemRefs?.itemIds?.length ||
    !!copiedBoxRefs?.rootBoxIds?.length

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
        onMouseDown={handleGridMouseDown}
      >
          <h1 className="sr-only">Wishlist</h1>
          <ItemGrid
            items={items}
            currentBoxId={null}
            loading={loading}
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

          <div className="mt-8 w-full flex justify-center">
            <WishlistSharingPanel
              layout="card"
              wishlistIsPublic={wishlistIsPublic}
              wishlistShareToken={wishlistShareToken}
              wishlistApplyColors={wishlistApplyColors}
              onPublicChange={setWishlistIsPublic}
              onApplyColorsChange={setWishlistApplyColors}
              onShareTokenChange={setWishlistShareToken}
            />
          </div>

          {wishlistActionBarVisible && (
            <SelectionActionBar
              selectedItems={selectedItems}
              pasteTarget={{ boxId: null, isWishlist: true }}
              onDeleteDone={loadWishlistItems}
              onPasteDone={loadWishlistItems}
              onClearSelection={() => setSelectedItemIds(new Set())}
              onExitSelectionMode={() => setSelectionMode(false)}
            />
          )}

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

          <MarkAcquiredDialog
            item={itemToMark}
            open={!!itemToMark}
            loading={marking}
            onOpenChange={(open) => !open && setItemToMark(null)}
            onConfirm={handleMarkAsAcquiredConfirm}
          />
          <MarqueeOverlay />
      </main>
    </div>
  )
}
