"use client"

import { Button } from "@/components/ui/button"
import { Star, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"

const BADGE_BASE =
  "bg-[hsl(var(--thumbnail-color))] text-[hsl(var(--thumbnail-foreground))] text-fluid-xs font-medium"
const STAR_BUTTON =
  "h-8 w-8 text-[hsl(var(--thumbnail-foreground))] hover:bg-[hsl(var(--thumbnail-highlight))] hover:text-[hsl(var(--thumbnail-hover))]"
const TRASH_BUTTON =
  "h-8 w-8 text-[hsl(var(--thumbnail-foreground))] hover:bg-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive-foreground))]"

/** Thumbnail label badge using theme CSS variables. Use className for layout (e.g. absolute positioning). */
export function ThumbnailBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(BADGE_BASE, "px-2 py-0.5 rounded", className)}
      aria-hidden
    >
      Thumbnail
    </span>
  )
}

export interface ThumbnailActionButtonsProps {
  isThumbnail?: boolean
  onSetThumbnail?: () => void
  onRemove?: () => void
  /** When true, buttons are non-interactive (e.g. theme editor preview). */
  preview?: boolean
}

/** Star (set as thumbnail) and Trash (remove) buttons with thumbnail theme styling. */
export function ThumbnailActionButtons({
  isThumbnail = false,
  onSetThumbnail,
  onRemove,
  preview = false,
}: ThumbnailActionButtonsProps) {
  const handleStar = (e: React.MouseEvent) => {
    if (preview) {
      e.preventDefault()
      return
    }
    onSetThumbnail?.()
  }
  const handleTrash = (e: React.MouseEvent) => {
    if (preview) {
      e.preventDefault()
      return
    }
    onRemove?.()
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={STAR_BUTTON}
        onClick={handleStar}
        title="Set as thumbnail"
        aria-label="Set as thumbnail"
      >
        <Star
          className={cn("h-4 w-4", isThumbnail && "fill-[hsl(var(--thumbnail-color))]")}
        />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={TRASH_BUTTON}
        onClick={handleTrash}
        title="Remove image"
        aria-label="Remove image"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </>
  )
}

/** Inline preview of thumbnail badge + actions (for theme editor). */
export function ThumbnailPreview() {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1.5 group/thumb">
        <ThumbnailBadge />
      </div>
      <ThumbnailActionButtons isThumbnail preview />
    </div>
  )
}
