"use client"

import { useState } from "react"
import { Item } from "@/lib/types"
import { buildItemCopyPayload } from "@/lib/utils"
import { useCopiedItem } from "@/lib/copied-item-context"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { Copy, ClipboardPaste, Trash2 } from "lucide-react"

export interface PasteTarget {
  boxId: string | null
  isWishlist: boolean
}

interface ItemContextMenuProps {
  item: Item
  /** When set, Paste is shown and creates item in this box (or wishlist). */
  pasteTarget?: PasteTarget | null
  /** When right-clicked item is in this list and length > 1, Copy/Delete apply to all selected. */
  selectedItems?: Item[]
  onDeleteDone: () => void
  onPasteDone: () => void
  children: React.ReactNode
}

export function ItemContextMenu({
  item,
  pasteTarget = null,
  selectedItems = [],
  onDeleteDone,
  onPasteDone,
  children,
}: ItemContextMenuProps) {
  const { copied, setCopied } = useCopiedItem()
  const [pasting, setPasting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const canPaste =
    copied !== null &&
    copied.length > 0 &&
    pasteTarget !== undefined &&
    pasteTarget !== null

  const applyToSelection =
    selectedItems.length > 1 && selectedItems.some((i) => i.id === item.id)

  const handleCopy = () => {
    if (applyToSelection) {
      setCopied(selectedItems.map(buildItemCopyPayload))
    } else {
      setCopied(buildItemCopyPayload(item))
    }
  }

  const handlePaste = async () => {
    if (!copied || copied.length === 0 || !pasteTarget || pasting) return
    setPasting(true)
    try {
      for (const payload of copied) {
        const res = await fetch("/api/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            box_id: pasteTarget.isWishlist ? null : pasteTarget.boxId,
            is_wishlist: pasteTarget.isWishlist,
          }),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error ?? "Failed to paste item")
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

  const handleDelete = async () => {
    if (deleting) return
    const idsToDelete = applyToSelection
      ? selectedItems.map((i) => i.id)
      : [item.id]
    const confirmed = window.confirm(
      idsToDelete.length > 1
        ? `Delete ${idsToDelete.length} items? This cannot be undone and will remove all associated photos.`
        : `Delete "${item.name}"? This cannot be undone and will delete all associated photos.`
    )
    if (!confirmed) return
    setDeleting(true)
    try {
      for (const itemId of idsToDelete) {
        const res = await fetch("/api/items/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId }),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error ?? "Failed to delete item")
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

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={handleCopy}>
          <Copy className="mr-2 h-4 w-4" />
          Copy
        </ContextMenuItem>
        {canPaste && (
          <ContextMenuItem onClick={handlePaste} disabled={pasting}>
            <ClipboardPaste className="mr-2 h-4 w-4" />
            {pasting ? "Pasting…" : "Paste"}
          </ContextMenuItem>
        )}
        <ContextMenuItem
          onClick={handleDelete}
          disabled={deleting}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {deleting ? "Deleting…" : "Delete"}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
