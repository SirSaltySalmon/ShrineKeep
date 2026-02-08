"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createSupabaseClient } from "@/lib/supabase/client"
import { Box, Item } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Plus, Search, Grid3x3 } from "lucide-react"
import BoxGrid from "@/components/box-grid"
import ItemGrid from "@/components/item-grid"
import Breadcrumbs from "@/components/breadcrumbs"

interface DashboardClientProps {
  user: any
}

export default function DashboardClient({ user }: DashboardClientProps) {
  const router = useRouter()
  const supabase = createSupabaseClient()
  const [currentBoxId, setCurrentBoxId] = useState<string | null>(null)
  const [boxes, setBoxes] = useState<Box[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [newBoxName, setNewBoxName] = useState("")
  const [newBoxDescription, setNewBoxDescription] = useState("")
  const [showNewBoxDialog, setShowNewBoxDialog] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

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

  const loadBoxes = async () => {
    try {
      const { data, error } = await supabase
        .from("boxes")
        .select("*")
        .eq("user_id", user.id)
        .eq("parent_box_id", currentBoxId || null)
        .order("position", { ascending: true })

      if (error) throw error
      setBoxes(data || [])
    } catch (error) {
      console.error("Error loading boxes:", error)
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
      setItems(data || [])
    } catch (error) {
      console.error("Error loading items:", error)
    }
  }

  const createBox = async () => {
    if (!newBoxName.trim()) return

    try {
      const { data, error } = await supabase
        .from("boxes")
        .insert({
          name: newBoxName,
          description: newBoxDescription || null,
          user_id: user.id,
          parent_box_id: currentBoxId || null,
        })
        .select()
        .single()

      if (error) throw error
      setBoxes([...boxes, data])
      setNewBoxName("")
      setNewBoxDescription("")
      setShowNewBoxDialog(false)
    } catch (error) {
      console.error("Error creating box:", error)
    }
  }

  const handleBoxClick = (box: Box) => {
    setCurrentBoxId(box.id)
  }


  useEffect(() => {
    loadItems(currentBoxId)
  }, [searchQuery])

  return (
    <>
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <Breadcrumbs currentBoxId={currentBoxId} onBoxClick={handleBoxClick} />
          <div className="flex items-center space-x-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 w-64"
              />
            </div>
            <Dialog open={showNewBoxDialog} onOpenChange={setShowNewBoxDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  New Box
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Box</DialogTitle>
                  <DialogDescription>
                    Create a new collection box to organize your items.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <label className="text-sm font-medium">Name</label>
                    <Input
                      value={newBoxName}
                      onChange={(e) => setNewBoxName(e.target.value)}
                      placeholder="My Collection"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Description (optional)</label>
                    <Input
                      value={newBoxDescription}
                      onChange={(e) => setNewBoxDescription(e.target.value)}
                      placeholder="A brief description..."
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowNewBoxDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={createBox}>Create</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">Loading...</div>
        ) : (
          <>
            {boxes.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-semibold mb-4 flex items-center">
                  <Grid3x3 className="h-5 w-5 mr-2" />
                  Boxes
                </h2>
                <BoxGrid boxes={boxes} onBoxClick={handleBoxClick} />
              </div>
            )}
            <div>
              <h2 className="text-xl font-semibold mb-4">Items</h2>
              <ItemGrid
                items={items}
                currentBoxId={currentBoxId}
                onItemUpdate={() => {
                  loadItems(currentBoxId)
                  loadBoxes()
                }}
              />
            </div>
          </>
        )}
      </main>
    </>
  )
}
