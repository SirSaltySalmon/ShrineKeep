"use client"

import { useState, useEffect } from "react"
import { createSupabaseClient } from "@/lib/supabase/client"
import { Item } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"
import { Plus, Check } from "lucide-react"
import Image from "next/image"
import ItemDialog from "@/components/item-dialog"

export default function WishlistClient() {
  const supabase = createSupabaseClient()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [showItemDialog, setShowItemDialog] = useState(false)

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
          photos (*)
        `)
        .eq("user_id", user.id)
        .eq("is_wishlist", true)
        .order("created_at", { ascending: false })

      if (error) throw error
      setItems(data || [])
    } catch (error) {
      console.error("Error loading wishlist:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleMarkAsAcquired = async (item: Item) => {
    const acquisitionDate = prompt("Enter acquisition date (YYYY-MM-DD) or leave blank for today:")
    const acquisitionPrice = prompt("Enter acquisition price:")

    try {
      const { error } = await supabase
        .from("items")
        .update({
          is_wishlist: false,
          acquisition_date: acquisitionDate || new Date().toISOString().split("T")[0],
          acquisition_price: acquisitionPrice ? parseFloat(acquisitionPrice) : null,
        })
        .eq("id", item.id)

      if (error) throw error
      loadWishlistItems()
    } catch (error) {
      console.error("Error marking as acquired:", error)
    }
  }

  if (loading) {
    return <div className="container mx-auto px-4 py-8">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold">Wishlist</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-4">
          <Button onClick={() => {
            setSelectedItem(null)
            setShowItemDialog(true)
          }}>
            <Plus className="h-4 w-4 mr-2" />
            Add to Wishlist
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {items.map((item) => (
            <Card key={item.id} className="hover:shadow-lg transition-shadow">
              <div className="relative w-full h-48 bg-muted rounded-t-lg overflow-hidden">
                {item.thumbnail_url ? (
                  <Image
                    src={item.thumbnail_url}
                    alt={item.name}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <span className="text-muted-foreground">No image</span>
                  </div>
                )}
              </div>
              <CardHeader>
                <CardTitle className="text-lg">{item.name}</CardTitle>
                {item.description && (
                  <CardDescription>{item.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {item.expected_price !== null && item.expected_price !== undefined && (
                    <div className="font-medium">
                      Expected: {formatCurrency(item.expected_price)}
                    </div>
                  )}
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => handleMarkAsAcquired(item)}
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Mark as Acquired
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {items.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
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
      </main>
    </div>
  )
}
