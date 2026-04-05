"use client"

import { useState, useEffect, useRef } from "react"
import { createSupabaseClient } from "@/lib/supabase/client"
import { Item } from "@/lib/types"
import { normalizeItem } from "@/lib/utils"
import { useMarqueeSelection } from "@/lib/hooks/use-marquee-selection"
import { SelectionModeToggle } from "@/components/selection-mode-toggle"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus } from "lucide-react"
import ItemCard from "@/components/item-card"
import ItemDialog from "@/components/item-dialog"
import { SelectionActionBar } from "@/components/selection-action-bar"
import { useCopiedItem } from "@/lib/copied-item-context"
import MarkAcquiredDialog from "@/components/mark-acquired-dialog"

export default function WishlistClient() {
  const supabase = createSupabaseClient()
  const { copiedItemRefs, copiedBoxRefs } = useCopiedItem()
  const gridRef = useRef<HTMLDivElement>(null)
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
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [showItemDialog, setShowItemDialog] = useState(false)
  const [itemToMark, setItemToMark] = useState<Item | null>(null)
  const [marking, setMarking] = useState(false)

  useEffect(() => {
    loadWishlistItems()
  }, [])

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

  const handleItemClick = (item: Item, e: React.MouseEvent) => {
    if (selectionMode) {
      setSelectedItemIds((prev) => {
        const next = new Set(prev)
        if (next.has(item.id)) next.delete(item.id)
        else next.add(item.id)
        return next
      })
      return
    }
    if (e.shiftKey) {
      setSelectedItemIds((prev) => {
        const next = new Set(prev)
        if (next.has(item.id)) next.delete(item.id)
        else next.add(item.id)
        return next
      })
      return
    }
    setSelectedItemIds(new Set())
    setSelectedItem(item)
    setShowItemDialog(true)
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

  if (loading) {
    return <div className="container mx-auto px-4 py-8 text-fluid-base text-muted-foreground min-w-0">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-background min-w-0 overflow-hidden">
      <header className="border-b min-w-0 overflow-hidden">
        <div className="container mx-auto px-4 py-4 min-w-0">
          <h1 className="text-fluid-2xl font-bold truncate min-w-0">Wishlist</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 min-w-0 overflow-hidden">
        <div className="mb-4 min-w-0">
          <Button onClick={() => {
            setSelectedItem(null)
            setShowItemDialog(true)
          }}>
            <Plus className="h-4 w-4 mr-2" />
            Add to Wishlist
          </Button>
        </div>

        <div
          ref={gridRef}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 relative"
          onMouseDown={handleGridMouseDown}
        >
          {items.map((item) => (
            <div
              key={item.id}
              ref={(el) => registerItemCardRef(item.id, el)}
              data-item-id={item.id}
            >
              <ItemCard
                item={item}
                variant="wishlist"
                selected={selectedItemIds.has(item.id)}
                selectionMode={selectionMode}
                onClick={handleItemClick}
                onMarkAcquired={openMarkAsAcquired}
              />
            </div>
          ))}
        </div>
        <MarqueeOverlay />

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

        {items.length === 0 && (
          <div className="text-center py-12 text-fluid-sm text-muted-foreground min-w-0">
            Your wishlist is empty. Add items you want to acquire!
          </div>
        )}

        <ItemDialog
          open={showItemDialog}
          onOpenChange={setShowItemDialog}
          item={selectedItem}
          isNew={!selectedItem}
          boxId={null}
          onSave={loadWishlistItems}
          isWishlist={true}
        />

        <MarkAcquiredDialog
          item={itemToMark}
          open={!!itemToMark}
          loading={marking}
          onOpenChange={(open) => !open && setItemToMark(null)}
          onConfirm={handleMarkAsAcquiredConfirm}
        />
      </main>
    </div>
  )
}
