"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createSupabaseClient } from "@/lib/supabase/client"
import { Box, Item } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Plus, Search, Grid3x3, Trash2 } from "lucide-react"
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { getItemDragId } from "@/components/draggable-item-card"
import { getBoxDropId } from "@/components/droppable-box-card"
import { MOVE_TO_PARENT_ZONE_ID } from "@/components/move-to-parent-zone"
import BoxGrid from "@/components/box-grid"
import BoxStatsDialog from "@/components/box-stats-dialog"
import BoxStatsPanel from "@/components/box-stats-panel"
import ItemGrid from "@/components/item-grid"
import MoveToParentZone from "@/components/move-to-parent-zone"
import Breadcrumbs from "@/components/breadcrumbs"

interface DashboardClientProps {
  user: any
}

export default function DashboardClient({ user }: DashboardClientProps) {
  const router = useRouter()
  const supabase = createSupabaseClient()
  const [currentBoxId, setCurrentBoxId] = useState<string | null>(null)
  const [currentBox, setCurrentBox] = useState<Box | null>(null)
  const [boxes, setBoxes] = useState<Box[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [newBoxName, setNewBoxName] = useState("")
  const [newBoxDescription, setNewBoxDescription] = useState("")
  const [showNewBoxDialog, setShowNewBoxDialog] = useState(false)
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

      try {
        const res = await fetch("/api/items/move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId, targetBoxId: targetParentBoxId }),
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
      if (boxId === targetParentBoxId) return

      try {
        const res = await fetch("/api/boxes/move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ boxId, targetParentBoxId }),
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

  return (
    <>
      <main className="container mx-auto px-4 py-8 min-w-0 overflow-hidden">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 min-w-0">
          <Breadcrumbs currentBoxId={currentBoxId} onBoxClick={handleBoxClick} />
          <div className="flex items-center space-x-2 min-w-0">
            <div className="relative min-w-0 w-full sm:w-auto sm:min-w-[12rem]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                placeholder="Search items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchQuery.trim()) {
                    e.preventDefault()
                    router.push(`/dashboard/search?q=${encodeURIComponent(searchQuery.trim())}`)
                  }
                }}
                className="pl-10 w-full min-w-0 sm:w-64"
              />
            </div>

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
                <div className="space-y-4 py-4 min-w-0 overflow-hidden">
                  <div className="min-w-0">
                    <label className="text-fluid-sm font-medium">Name</label>
                    <Input
                      value={editBoxName}
                      onChange={(e) => setEditBoxName(e.target.value)}
                      placeholder="My Collection"
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="text-fluid-sm font-medium">Description (optional)</label>
                    <Input
                      value={editBoxDescription}
                      onChange={(e) => setEditBoxDescription(e.target.value)}
                      placeholder="A brief description..."
                    />
                  </div>

                  <div className="border-t pt-4 space-y-3 min-w-0 overflow-hidden">
                    <div className="flex items-center gap-2 text-fluid-sm font-medium text-destructive">
                      <Trash2 className="h-4 w-4" />
                      Delete box
                    </div>
                    {deleteMode == null ? (
                      <div className="flex flex-col gap-2 min-w-0 overflow-hidden">
                        <p className="text-fluid-sm text-muted-foreground">
                          Choose how to handle contents:
                        </p>
                        <div className="flex flex-col gap-2 min-w-0 overflow-hidden">
                          <label className="flex items-start gap-2 text-fluid-sm cursor-pointer min-w-0">
                            <input
                              type="radio"
                              name="delete-mode"
                              checked={deleteMode === "delete-all"}
                              onChange={() => setDeleteMode("delete-all")}
                              className="mt-1"
                            />
                            <span className="min-w-0 overflow-hidden">
                              <strong>Delete all:</strong> Permanently delete this box and all child items, sub-boxes, and their data (value history, photos, etc.).
                            </span>
                          </label>
                          <label className="flex items-start gap-2 text-fluid-sm cursor-pointer min-w-0">
                            <input
                              type="radio"
                              name="delete-mode"
                              checked={deleteMode === "move-to-root"}
                              onChange={() => setDeleteMode("move-to-root")}
                              className="mt-1"
                            />
                            <span className="min-w-0 overflow-hidden">
                              <strong>Move to root:</strong> Move all child items and sub-boxes to the root level, then delete this box.
                            </span>
                          </label>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3 min-w-0 overflow-hidden">
                        <p className="text-fluid-sm text-muted-foreground">
                          {deleteMode === "delete-all"
                            ? "All contents will be permanently deleted. This cannot be undone."
                            : "Child boxes and items will become root-level, then this box will be removed."}
                        </p>
                        <div className="min-w-0 overflow-hidden">
                          <label className="text-fluid-sm font-medium min-w-0">
                            Type the box name to confirm: <strong className="break-all">{editBox?.name}</strong>
                          </label>
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
            />
            <div className="mb-8 min-w-0 overflow-visible">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4 min-w-0">
                <h2 className="text-fluid-xl font-semibold flex items-center min-w-0 truncate">
                  <Grid3x3 className="h-4 w-4 sm:h-5 sm:w-5 mr-2 shrink-0" />
                  Boxes
                </h2>
                <Dialog open={showNewBoxDialog} onOpenChange={setShowNewBoxDialog}>
                  <Button onClick={() => setShowNewBoxDialog(true)} className="shrink-0">
                    <Plus className="h-4 w-4 mr-2 shrink-0" />
                    <span className="truncate">New Box</span>
                  </Button>
                  <DialogContent className="min-w-0">
                    <DialogHeader className="min-w-0">
                      <DialogTitle>Create New Box</DialogTitle>
                      <DialogDescription>
                        Create a new collection box to organize your items.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4 min-w-0 overflow-hidden">
                      <div className="min-w-0">
                        <label className="text-fluid-sm font-medium">Name</label>
                        <Input
                          value={newBoxName}
                          onChange={(e) => setNewBoxName(e.target.value)}
                          placeholder="My Collection"
                        />
                      </div>
                      <div className="min-w-0">
                        <label className="text-fluid-sm font-medium">Description (optional)</label>
                        <Input
                          value={newBoxDescription}
                          onChange={(e) => setNewBoxDescription(e.target.value)}
                          placeholder="A brief description..."
                        />
                      </div>
                    </div>
                    <DialogFooter className="min-w-0">
                      <Button variant="outline" onClick={() => setShowNewBoxDialog(false)}>
                        Cancel
                      </Button>
                      <Button onClick={createBox}>Create</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
              <BoxGrid
                boxes={boxes}
                onBoxClick={handleBoxClick}
                onRename={openEditBox}
                onShowStats={(box) => {
                  setStatsBoxId(box.id)
                  setStatsBoxName(box.name)
                  setShowStatsDialog(true)
                }}
              />
            </div>
            {currentBox != null && (
              <div className="mb-6">
                <MoveToParentZone
                  isRoot={!currentBox.parent_box_id}
                />
              </div>
            )}
            <div>
              {searchQuery.trim() && items.length === 0 ? (
                <div className="text-center py-12 space-y-3 min-w-0 overflow-hidden">
                  <h2 className="text-fluid-xl font-semibold mb-4">Items</h2>
                  <p className="text-fluid-sm text-muted-foreground">
                    No items in this box.{" "}
                    <Link
                      href={`/dashboard/search?q=${encodeURIComponent(searchQuery.trim())}`}
                      className="text-primary font-medium underline underline-offset-2 hover:no-underline"
                    >
                      Search sub-boxes?
                    </Link>
                  </p>
                  <p className="text-fluid-sm text-muted-foreground">
                    Or press Enter in the search box to see all matching items.
                  </p>
                </div>
              ) : (
                <ItemGrid
                  items={items}
                  currentBoxId={currentBoxId}
                  onItemUpdate={() => {
                    loadItems(currentBoxId)
                    loadBoxes()
                    setStatsRefreshKey((k) => k + 1)
                  }}
                  sectionTitle="Items"
                />
              )}
            </div>
          </DndContext>
        )}

        <BoxStatsDialog
          boxId={statsBoxId}
          boxName={statsBoxName}
          open={showStatsDialog}
          onOpenChange={setShowStatsDialog}
        />
      </main>
    </>
  )
}
