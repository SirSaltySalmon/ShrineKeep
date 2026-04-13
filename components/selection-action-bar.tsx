"use client"

import { useEffect, useState } from "react"
import { Box, Item } from "@/lib/types"
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
  /** Dashboard box view: duplicate each item as collection vs wishlist like the source. */
  preserveItemKindsInBox?: boolean
}

/**
 * Free tier counts only non-wishlist (collection) rows. Paste can duplicate wishlist rows
 * without consuming the collection cap when using preserve-item-kinds or wishlist target.
 */
function countCollectionCreatesFromItemPaste(
  pasteTarget: PasteTarget,
  refs: { itemIds: string[]; collectionSourceCount?: number } | null
): number {
  if (!refs?.itemIds?.length) return 0
  if (pasteTarget.isWishlist) {
    return 0
  }
  if (pasteTarget.preserveItemKindsInBox) {
    const c = refs.collectionSourceCount
    return typeof c === "number" ? c : refs.itemIds.length
  }
  return refs.itemIds.length
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
  /** Paste/create blocked by free-tier item cap (403 item_limit_reached). */
  onItemCapReached?: () => void
  /** When set with itemCap and isPro === false, Paste opens upsell before calling the API if the clipboard would exceed the cap. */
  totalItemCount?: number
  itemCap?: number | null
  isPro?: boolean
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
  onItemCapReached,
  totalItemCount,
  itemCap = null,
  isPro = true,
  className,
}: SelectionActionBarProps) {
  const {
    copiedItemRefs,
    setCopiedItemRefs,
    copiedBoxRefs,
    setCopiedBoxRefs,
    clearClipboard,
  } = useCopiedItem()
  const [pasting, setPasting] = useState(false)
  const [copying, setCopying] = useState(false)
  const [copiedDone, setCopiedDone] = useState(false)
  const [pastedDone, setPastedDone] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteBoxConfirmNames, setDeleteBoxConfirmNames] = useState("")
  const [deleteMode, setDeleteMode] = useState<"delete-all" | "move-to-root">("delete-all")

  const hasSelection = selectedItems.length > 0 || selectedBoxes.length > 0
  const canCopy = hasSelection
  const hasItemRefs = !!copiedItemRefs?.itemIds?.length
  const hasBoxRefs = !!copiedBoxRefs?.rootBoxIds?.length
  const canPaste = !copying && pasteTarget !== null && (hasItemRefs || hasBoxRefs)

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

  useEffect(() => {
    if (!copiedDone) return
    const id = window.setTimeout(() => setCopiedDone(false), 1200)
    return () => window.clearTimeout(id)
  }, [copiedDone])

  useEffect(() => {
    if (!pastedDone) return
    const id = window.setTimeout(() => setPastedDone(false), 1200)
    return () => window.clearTimeout(id)
  }, [pastedDone])

  const handleCopy = async () => {
    if (!hasSelection) return
    if (!canCopy || copying) return
    setCopying(true)
    try {
      const selectedItemIds = selectedItems.map((i) => i.id)
      const rootIds = selectedBoxes
        .filter((b) => !selectedBoxes.some((p) => p.id === (b.parent_box_id ?? "")))
        .map((b) => b.id)

      setCopiedItemRefs(
        selectedItemIds.length > 0
          ? {
              itemIds: selectedItemIds,
              collectionSourceCount: selectedItems.filter((i) => !i.is_wishlist).length,
            }
          : null
      )
      setCopiedBoxRefs(rootIds.length > 0 ? { rootBoxIds: rootIds } : null)
      if (rootIds.length > 0) {
        void fetch("/api/boxes/subtree/count", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rootIds }),
        })
          .then(async (res) => {
            if (!res.ok) return null
            const data = (await res.json()) as { itemCount?: number }
            if (typeof data.itemCount === "number") {
              setCopiedBoxRefs({ rootBoxIds: rootIds, estimatedCreateCount: data.itemCount })
            }
            return null
          })
          .catch(() => null)
      }

      setCopiedDone(true)
      setPastedDone(false)
    } finally {
      setCopying(false)
    }
  }

  const handlePaste = async () => {
    if (!canPaste || pasting) return

    if (
      pasteTarget &&
      !pasteTarget.isWishlist &&
      !isPro &&
      itemCap !== null &&
      typeof totalItemCount === "number" &&
      onItemCapReached
    ) {
      let fromTreeRefs = copiedBoxRefs?.estimatedCreateCount ?? 0
      if (
        copiedBoxRefs?.estimatedCreateCount == null &&
        copiedBoxRefs?.rootBoxIds?.length
      ) {
        const countRes = await fetch("/api/boxes/subtree/count", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rootIds: copiedBoxRefs.rootBoxIds }),
        })
        if (countRes.ok) {
          const countData = (await countRes.json()) as { itemCount?: number }
          if (typeof countData.itemCount === "number") {
            fromTreeRefs = countData.itemCount
            setCopiedBoxRefs({
              rootBoxIds: copiedBoxRefs.rootBoxIds,
              estimatedCreateCount: countData.itemCount,
            })
          }
        }
      }
      const fromTrees = fromTreeRefs
      const fromItems = countCollectionCreatesFromItemPaste(pasteTarget, copiedItemRefs)
      const wouldCreate = fromTrees + fromItems
      if (wouldCreate > 0 && totalItemCount + wouldCreate > itemCap) {
        onItemCapReached()
        return
      }
    }

    setPasting(true)
    try {
      if (hasBoxRefs && pasteTarget && !pasteTarget.isWishlist) {
        const res = await fetch("/api/boxes/paste", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceRootBoxIds: copiedBoxRefs?.rootBoxIds ?? [],
            targetParentBoxId: pasteTarget.boxId,
          }),
        })
        const data = await res.json().catch(() => ({} as { error?: string }))
        if (res.status === 403 && data.error === "item_limit_reached") {
          onItemCapReached?.()
          return
        }
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to paste boxes")
        }
      }
      if (pasteTarget && hasItemRefs) {
        const res = await fetch("/api/items/paste", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceItemIds: copiedItemRefs?.itemIds ?? [],
            target: {
              boxId: pasteTarget.boxId,
              isWishlist: pasteTarget.isWishlist,
              ...(pasteTarget.preserveItemKindsInBox ? { preserveItemKindsInBox: true } : {}),
            },
          }),
        })
        const data = await res.json().catch(() => ({} as { error?: string }))
        if (res.status === 403 && data.error === "item_limit_reached") {
          onItemCapReached?.()
          return
        }
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to paste items")
        }
      }
      onPasteDone()
      setPastedDone(true)
      setCopiedDone(false)
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
    : hasItemRefs || hasBoxRefs
      ? [
          copiedItemRefs?.itemIds?.length
            ? `${copiedItemRefs.itemIds.length} item${copiedItemRefs.itemIds.length === 1 ? "" : "s"}`
            : null,
          copiedBoxRefs?.rootBoxIds?.length
            ? `${copiedBoxRefs.rootBoxIds.length} box tree${copiedBoxRefs.rootBoxIds.length === 1 ? "" : "s"}`
            : null,
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
            disabled={!hasSelection || copying}
            className="rounded-lg"
          >
            <Copy className="h-4 w-4 mr-1.5" />
            {copying ? "Copying…" : copiedDone ? "Copied!" : "Copy"}
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
              {pasting ? "Pasting…" : pastedDone ? "Pasted!" : "Paste"}
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
