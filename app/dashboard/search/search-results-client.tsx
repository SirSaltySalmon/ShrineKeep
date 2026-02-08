"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { createSupabaseClient } from "@/lib/supabase/client"
import { Item } from "@/lib/types"
import ItemCard from "@/components/item-card"
import ItemDialog from "@/components/item-dialog"
import { ArrowLeft } from "lucide-react"

interface SearchResultsClientProps {
  user: { id: string } | null
  initialQuery: string
}

export default function SearchResultsClient({
  user,
  initialQuery,
}: SearchResultsClientProps) {
  const searchParams = useSearchParams()
  const q = searchParams.get("q") ?? initialQuery
  const supabase = createSupabaseClient()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [showItemDialog, setShowItemDialog] = useState(false)

  useEffect(() => {
    if (!user?.id) {
      setLoading(false)
      return
    }
    const query = (q || "").trim()
    if (!query) {
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    supabase
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
      .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
      .order("position", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.error("Error searching items:", error)
          setItems([])
        } else {
          setItems(data || [])
        }
        setLoading(false)
      })
  }, [user?.id, q])

  const handleItemClick = (item: Item) => {
    setSelectedItem(item)
    setShowItemDialog(true)
  }

  const handleSave = () => {
    const query = (q || "").trim()
    if (!query || !user?.id) return
    setLoading(true)
    supabase
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
      .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
      .order("position", { ascending: true })
      .then(({ data, error }) => {
        if (!error) setItems(data || [])
        setLoading(false)
      })
  }

  if (!q?.trim()) {
    return (
      <main className="container mx-auto px-4 py-8">
        <Link
          href="/dashboard"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Collections
        </Link>
        <p className="text-muted-foreground">Enter a search term to find items.</p>
      </main>
    )
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <Link
        href="/dashboard"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to Collections
      </Link>
      <h1 className="text-2xl font-semibold mb-2">Search: &ldquo;{q}&rdquo;</h1>
      <p className="text-muted-foreground mb-6">
        {loading ? "Loading..." : `${items.length} item${items.length === 1 ? "" : "s"} found`}
      </p>
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No items match your search.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              variant="collection"
              onClick={handleItemClick}
            />
          ))}
        </div>
      )}
      <ItemDialog
        open={showItemDialog}
        onOpenChange={setShowItemDialog}
        item={selectedItem}
        isNew={false}
        boxId={selectedItem?.box_id ?? null}
        onSave={handleSave}
      />
    </main>
  )
}
