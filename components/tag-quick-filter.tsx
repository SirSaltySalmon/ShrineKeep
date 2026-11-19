"use client"

import type { CSSProperties } from "react"
import type { Tag, TagColor } from "@/lib/types"
import { cn, FOCUS_RING_CLASS, getTagChipStyle } from "@/lib/utils"

interface TagQuickFilterProps {
  /** Tags carried by the items in the current view, already in canonical order. */
  tags: Tag[]
  /** Include-tags from the shared search filters. Ids that are not in `tags` are ignored. */
  activeTagIds: readonly string[]
  onToggle: (tagId: string) => void
  className?: string
}

/** A filled chip is the app's tag chip; an unfilled one keeps only its edge in the tag colour. */
function chipStyle(color: TagColor, filled: boolean): CSSProperties {
  const chip = getTagChipStyle(color)
  return filled ? { ...chip, borderColor: chip.background } : { borderColor: chip.background }
}

/**
 * One-tap tag filter above the item grid. Each chip toggles that tag in the include-tags
 * filter, the same state the Filters panel edits. Renders nothing when the view has no tags.
 */
export default function TagQuickFilter({ tags, activeTagIds, onToggle, className }: TagQuickFilterProps) {
  if (tags.length === 0) return null

  const active = new Set(activeTagIds)
  const anyActive = tags.some((tag) => active.has(tag.id))

  return (
    <div
      role="group"
      aria-label="Filter items by tag"
      className={cn("flex flex-wrap items-center gap-1.5 min-w-0", className)}
    >
      <span className="text-fluid-xs text-muted-foreground">Tags</span>
      {tags.map((tag) => {
        const pressed = active.has(tag.id)
        return (
          <button
            key={tag.id}
            type="button"
            aria-pressed={pressed}
            title={tag.name}
            onClick={() => onToggle(tag.id)}
            className={cn(
              "max-w-full truncate rounded-md border-2 px-2 py-0.5 text-fluid-xs font-medium transition-opacity",
              FOCUS_RING_CLASS,
              // Until a chip is picked they all read as plain tags; after that the rest step back.
              anyActive && !pressed && "opacity-60 hover:opacity-100"
            )}
            style={chipStyle(tag.color ?? "blue", pressed || !anyActive)}
          >
            {tag.name}
          </button>
        )
      })}
    </div>
  )
}
