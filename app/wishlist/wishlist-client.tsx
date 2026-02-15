"use client"

import { useState, useEffect } from "react"
import { createSupabaseClient } from "@/lib/supabase/client"
import { Item } from "@/lib/types"
import { normalizeItem } from "@/lib/utils"
import { useMarqueeSelection } from "@/lib/hooks/use-marquee-selection"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Plus } from "lucide-react"
import ItemCard from "@/components/item-card"
import ItemDialog from "@/components/item-dialog"
import { SelectionActionBar } from "@/components/selection-action-bar"
import { useCopiedItem } from "@/lib/copied-item-context"

export default function WishlistClient() {
  const supabase = createSupabaseClient()
  const { copied } = useCopiedItem()
  const {
    selectedIds,
    setSelectedIds,
    gridRef,
    registerCardRef,
    handleGridMouseDown,
    marquee,
  } = useMarqueeSelection()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [showItemDialog, setShowItemDialog] = useState(false)
  const [itemToMark, setItemToMark] = useState<Item | null>(null)
  const [acquisitionDate, setAcquisitionDate] = useState("")
  const [acquisitionPrice, setAcquisitionPrice] = useState("")
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
    setAcquisitionDate(new Date().toISOString().split("T")[0])
    setAcquisitionPrice(item.expected_price?.toString() ?? "")
  }

  const handleItemClick = (item: Item, e: React.MouseEvent) => {
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
    setSelectedItem(item)
    setShowItemDialog(true)
  }

  const selectedItems = items.filter((i) => selectedIds.has(i.id))

  const handleMarkAsAcquiredConfirm = async () => {
    if (!itemToMark) return
    setMarking(true)
    try {
      const { error } = await supabase
        .from("items")
        .update({
          is_wishlist: false,
          acquisition_date: acquisitionDate || new Date().toISOString().split("T")[0],
          acquisition_price: acquisitionPrice.trim() ? parseFloat(acquisitionPrice) : null,
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
          ref={gridRef as React.RefObject<HTMLDivElement>}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 relative"
          onMouseDown={handleGridMouseDown}
        >
          {items.map((item) => (
            <div
              key={item.id}
              ref={(el) => registerCardRef(item.id, el)}
              data-item-id={item.id}
            >
              <ItemCard
                item={item}
                variant="wishlist"
                selected={selectedIds.has(item.id)}
                onClick={handleItemClick}
                onMarkAcquired={openMarkAsAcquired}
              />
            </div>
          ))}
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

        {(selectedItems.length > 0 || (copied !== null && copied.length > 0)) && (
          <SelectionActionBar
            selectedItems={selectedItems}
            pasteTarget={{ boxId: null, isWishlist: true }}
            onDeleteDone={loadWishlistItems}
            onPasteDone={loadWishlistItems}
            onClearSelection={() => setSelectedIds(new Set())}
          />
        )}

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

        <Dialog open={!!itemToMark} onOpenChange={(open) => !open && setItemToMark(null)}>
          <DialogContent className="sm:max-w-[425px] min-w-0">
            <DialogHeader className="min-w-0">
              <DialogTitle>Mark as Acquired</DialogTitle>
              <DialogDescription>
                {itemToMark
                  ? `Enter acquisition details for "${itemToMark.name}". The item will move out of your wishlist.`
                  : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4 layout-shrink-visible">
              <div className="grid gap-2 min-w-0">
                <Label>Acquisition date</Label>
                <Input
                  type="date"
                  value={acquisitionDate}
                  onChange={(e) => setAcquisitionDate(e.target.value)}
                />
              </div>
              <div className="grid gap-2 min-w-0">
                <Label>Acquisition price</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={acquisitionPrice}
                  onChange={(e) => setAcquisitionPrice(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setItemToMark(null)}>
                Cancel
              </Button>
              <Button onClick={handleMarkAsAcquiredConfirm} disabled={marking}>
                {marking ? "Saving..." : "Mark as Acquired"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}
