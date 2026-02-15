"use client"

import { useState } from "react"
import { Box, Item } from "@/lib/types"
import type { ItemCopyPayload } from "@/lib/types"
import { buildItemCopyPayload, buildBoxCopyPayloadTrees, normalizeItem } from "@/lib/utils"
import { useCopiedItem } from "@/lib/copied-item-context"
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
import { Copy, ClipboardPaste, Trash2, X } from "lucide-react"
import { cn } from "@/lib/utils"

export interface PasteTarget {
  boxId: string | null
  isWishlist: boolean
}

/**
 * Single "price" for copy/paste: on wishlist it's expected_price, on collection it's acquisition_price.
 */
function getSourcePrice(payload: ItemCopyPayload): number | null {
  if (payload.is_wishlist) return payload.expected_price ?? null
  return payload.acquisition_price ?? null
}

function buildPasteBody(payload: ItemCopyPayload, pasteTarget: PasteTarget): Record<string, unknown> {
  const base = {
    name: payload.name,
    description: payload.description ?? null,
    thumbnail_url: payload.thumbnail_url ?? null,
    photos: payload.photos,
    tag_ids: payload.tag_ids,
    is_wishlist: pasteTarget.isWishlist,
    box_id: pasteTarget.isWishlist ? null : pasteTarget.boxId,
    current_value: payload.current_value ?? null,
  }
  const sourcePrice = getSourcePrice(payload)

  if (pasteTarget.isWishlist) {
    return {
      ...base,
      acquisition_price: null,
      acquisition_date: null,
      expected_price: sourcePrice,
    }
  }

  return {
    ...base,
    expected_price: null,
    acquisition_price: sourcePrice,
    acquisition_date: payload.is_wishlist ? null : (payload.acquisition_date ?? null),
  }
}

interface SelectionActionBarProps {
  selectedItems: Item[]
  selectedBoxes?: Box[]
  pasteTarget: PasteTarget | null
  onDeleteDone: () => void
  onPasteDone: () => void
  onClearSelection: () => void
  /** When in selection mode, called when user dismisses/clears so parent can exit selection mode. */
  onExitSelectionMode?: () => void
  className?: string
}

export function SelectionActionBar({
  selectedItems,
  selectedBoxes = [],
  pasteTarget,
  onDeleteDone,
  onPasteDone,
  onClearSelection,
  onExitSelectionMode,
  className,
}: SelectionActionBarProps) {
  const { copied, setCopied, copiedBoxTrees, setCopiedBoxTrees, clearClipboard } = useCopiedItem()
  const [pasting, setPasting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteBoxConfirmNames, setDeleteBoxConfirmNames] = useState("")
  const [deleteMode, setDeleteMode] = useState<"delete-all" | "move-to-root">("delete-all")

  const hasSelection = selectedItems.length > 0 || selectedBoxes.length > 0
  const canPaste =
    pasteTarget !== null &&
    ((copied !== null && copied.length > 0) || (copiedBoxTrees !== null && copiedBoxTrees.length > 0))

  const selectedBoxNames = selectedBoxes.map((b) => b.name)
  const deleteBoxNamesMatch =
    selectedBoxes.length === 0 ||
    selectedBoxNames
      .slice()
      .sort()
      .join(", ") ===
      deleteBoxConfirmNames
        .split(/,\s*/)
        .map((s) => s.trim())
        .filter(Boolean)
        .sort()
        .join(", ")

  const handleCopy = async () => {
    if (selectedItems.length > 0) {
      setCopied(selectedItems.map(buildItemCopyPayload))
    } else {
      setCopied(null)
    }
    if (selectedBoxes.length > 0) {
      const rootIds = selectedBoxes
        .filter((b) => !selectedBoxes.some((p) => p.id === (b.parent_box_id ?? "")))
        .map((b) => b.id)
      if (rootIds.length > 0) {
        try {
          const res = await fetch("/api/boxes/subtree", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rootIds }),
          })
          if (!res.ok) throw new Error("Failed to fetch subtree")
          const { boxes, items } = await res.json()
          const normalizedItems = (items ?? []).map((row: unknown) => normalizeItem(row as Record<string, unknown>))
          const trees = buildBoxCopyPayloadTrees(boxes ?? [], normalizedItems, rootIds)
          setCopiedBoxTrees(trees)
        } catch (e) {
          console.error(e)
          setCopiedBoxTrees(null)
        }
      } else {
        setCopiedBoxTrees(null)
      }
    } else {
      setCopiedBoxTrees(null)
    }
  }

  const handlePaste = async () => {
    if (!canPaste || pasting) return
    setPasting(true)
    try {
      if (copiedBoxTrees && copiedBoxTrees.length > 0 && pasteTarget && !pasteTarget.isWishlist) {
        const res = await fetch("/api/boxes/paste", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trees: copiedBoxTrees,
            targetParentBoxId: pasteTarget.boxId,
          }),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error ?? "Failed to paste boxes")
        }
      }
      if (copied && copied.length > 0 && pasteTarget) {
        for (const payload of copied) {
          const body = buildPasteBody(payload, pasteTarget)
          const res = await fetch("/api/items", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
          if (!res.ok) {
            const data = await res.json()
            throw new Error(data.error ?? "Failed to paste item")
          }
        }
      }
      onPasteDone()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      alert(`Paste failed: ${msg}`)
    } finally {
      setPasting(false)
    }
  }

  const handleClear = () => {
    onClearSelection()
    if (!hasSelection) {
      clearClipboard()
      onExitSelectionMode?.()
    }
  }

  const handleDeleteClick = () => {
    setDeleteBoxConfirmNames("")
    setDeleteMode("delete-all")
    setShowDeleteDialog(true)
  }

  const handleDeleteConfirm = async () => {
    if (selectedBoxes.length > 0 && !deleteBoxNamesMatch) return
    setDeleting(true)
    setShowDeleteDialog(false)
    try {
      if (selectedItems.length > 0) {
        const res = await fetch("/api/items/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemIds: selectedItems.map((i) => i.id) }),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error ?? "Failed to delete items")
        }
      }
      if (selectedBoxes.length > 0) {
        const res = await fetch("/api/boxes/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            boxes: selectedBoxes.map((b) => ({ boxId: b.id, mode: deleteMode })),
          }),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error ?? "Failed to delete boxes")
        }
      }
      onDeleteDone()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      alert(`Delete failed: ${msg}`)
    } finally {
      setDeleting(false)
    }
  }

  const summaryText = hasSelection
    ? [
        selectedItems.length > 0 && `${selectedItems.length} item${selectedItems.length === 1 ? "" : "s"}`,
        selectedBoxes.length > 0 && `${selectedBoxes.length} box${selectedBoxes.length === 1 ? "" : "es"}`,
      ]
        .filter(Boolean)
        .join(", ") + " selected"
    : copied?.length || copiedBoxTrees?.length
      ? [
          copied?.length ? `${copied.length} item${copied.length === 1 ? "" : "s"}` : null,
          copiedBoxTrees?.length ? `${copiedBoxTrees.length} box tree${copiedBoxTrees.length === 1 ? "" : "s"}` : null,
        ]
          .filter(Boolean)
          .join(", ") + " in clipboard"
      : ""

  return (
    <>
      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between gap-4 border-t border-border bg-card/95 backdrop-blur px-4 py-3.5 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] rounded-t-2xl",
          "animate-in slide-in-from-bottom duration-200",
          className
        )}
      >
        <p className="text-sm text-muted-foreground truncate min-w-0">{summaryText}</p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleCopy}
            disabled={!hasSelection}
            className="rounded-lg"
          >
            <Copy className="h-4 w-4 mr-1.5" />
            Copy
          </Button>
          {canPaste && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handlePaste}
              disabled={pasting}
              className="rounded-lg"
            >
              <ClipboardPaste className="h-4 w-4 mr-1.5" />
              {pasting ? "Pasting…" : "Paste"}
            </Button>
          )}
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleDeleteClick}
            disabled={deleting || !hasSelection}
            className="rounded-lg"
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            {deleting ? "Deleting…" : "Delete"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="rounded-lg"
            aria-label={hasSelection ? "Clear selection" : "Dismiss and clear clipboard"}
          >
            <X className="h-4 w-4 mr-1.5" />
            {hasSelection ? "Clear" : "Dismiss"}
          </Button>
        </div>
      </div>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Delete selection</DialogTitle>
            <DialogDescription>
              The following will be permanently deleted. For boxes, type their names to confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {selectedItems.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-1">Items ({selectedItems.length})</p>
                <ul className="text-sm text-muted-foreground list-disc list-inside">
                  {selectedItems.slice(0, 10).map((i) => (
                    <li key={i.id}>{i.name}</li>
                  ))}
                  {selectedItems.length > 10 && <li>…and {selectedItems.length - 10} more</li>}
                </ul>
              </div>
            )}
            {selectedBoxes.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-1">Boxes ({selectedBoxes.length})</p>
                <ul className="text-sm text-muted-foreground list-disc list-inside mb-2">
                  {selectedBoxes.map((b) => (
                    <li key={b.id}>{b.name}</li>
                  ))}
                </ul>
                <div className="space-y-2">
                  <Label className="text-sm">
                    Type the box names to confirm (comma-separated):{" "}
                    <span className="font-normal text-muted-foreground layout-shrink-visible">
                      {selectedBoxNames.join(", ")}
                    </span>
                  </Label>
                </div>
                <Input
                  value={deleteBoxConfirmNames}
                  onChange={(e) => setDeleteBoxConfirmNames(e.target.value)}
                  placeholder="Box name, Box name 2, ..."
                  className="font-mono text-sm layout-shrink-visible"
                />
                <div className="flex gap-4 mt-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="delete-mode"
                      checked={deleteMode === "delete-all"}
                      onChange={() => setDeleteMode("delete-all")}
                    />
                    Delete all contents
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="delete-mode"
                      checked={deleteMode === "move-to-root"}
                      onChange={() => setDeleteMode("move-to-root")}
                    />
                    Move contents to root
                  </label>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={
                (selectedBoxes.length > 0 && !deleteBoxNamesMatch) || deleting
              }
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
