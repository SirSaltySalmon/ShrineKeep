"use client"

import { useState } from "react"
import { Item } from "@/lib/types"
import type { ItemCopyPayload } from "@/lib/types"
import { buildItemCopyPayload } from "@/lib/utils"
import { useCopiedItem } from "@/lib/copied-item-context"
import { Button } from "@/components/ui/button"
import { Copy, ClipboardPaste, Trash2, X } from "lucide-react"
import { cn } from "@/lib/utils"

export interface PasteTarget {
  boxId: string | null
  isWishlist: boolean
}

/**
 * Single "price" for copy/paste: on wishlist it's expected_price, on collection it's acquisition_price.
 * Pasting to wishlist never creates value_history. Pasting to collection sets acquisition + current_value so one value record is created.
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
  pasteTarget: PasteTarget | null
  onDeleteDone: () => void
  onPasteDone: () => void
  onClearSelection: () => void
  className?: string
}

export function SelectionActionBar({
  selectedItems,
  pasteTarget,
  onDeleteDone,
  onPasteDone,
  onClearSelection,
  className,
}: SelectionActionBarProps) {
  const { copied, setCopied } = useCopiedItem()
  const [pasting, setPasting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const canPaste =
    copied !== null &&
    copied.length > 0 &&
    pasteTarget !== null

  const hasSelection = selectedItems.length > 0

  const handleCopy = () => {
    if (hasSelection) setCopied(selectedItems.map(buildItemCopyPayload))
  }

  const handlePaste = async () => {
    if (!copied || copied.length === 0 || !pasteTarget || pasting) return
    setPasting(true)
    try {
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
    if (!hasSelection) setCopied(null)
  }

  const handleDelete = async () => {
    if (deleting || !hasSelection) return
    const confirmed = window.confirm(
      selectedItems.length > 1
        ? `Delete ${selectedItems.length} items? This cannot be undone and will remove all associated photos.`
        : `Delete "${selectedItems[0]?.name}"? This cannot be undone and will delete all associated photos.`
    )
    if (!confirmed) return
    setDeleting(true)
    try {
      for (const item of selectedItems) {
        const res = await fetch("/api/items/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId: item.id }),
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
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between gap-4 border-t bg-card px-4 py-3 shadow-lg rounded-t-lg border-border",
        "animate-in slide-in-from-bottom duration-200",
        className
      )}
    >
      <p className="text-sm text-muted-foreground">
        {hasSelection
          ? `${selectedItems.length} item${selectedItems.length === 1 ? "" : "s"} selected`
          : copied && copied.length > 0
            ? `${copied.length} item${copied.length === 1 ? "" : "s"} in clipboard`
            : ""}
      </p>
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
          onClick={handleDelete}
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
  )
}
