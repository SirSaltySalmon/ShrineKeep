"use client"

import type { CSSProperties } from "react"
import type { Tag, TagColor } from "@/lib/types"
import { cn, FOCUS_RING_CLASS, getTagChipStyle } from "@/lib/utils"
import { LOADED_FADE_CLASS, useSeenLoading } from "@/lib/hooks/use-seen-loading"

interface TagQuickFilterProps {
  /** Tags carried by the items in the current view, already in canonical order. */
  tags: Tag[]
  /** Include-tags from the shared search filters. Ids that are not in `tags` are ignored. */
  activeTagIds: readonly string[]
  onToggle: (tagId: string) => void
  /** The view's items are not in yet, so its tags are not known. */
  loading?: boolean
  className?: string
}

/** A filled chip is the app's tag chip; an unfilled one keeps only its edge in the tag colour. */
function chipStyle(color: TagColor, filled: boolean): CSSProperties {
  const chip = getTagChipStyle(color)
  return filled ? { ...chip, borderColor: chip.background } : { borderColor: chip.background }
}

/**
 * One line and one height whatever it holds, so tags arriving (or a view having none) never
 * moves the grid below. From `md` up it shares the item header row, which the add button
 * already makes 40px tall; below `md` it is a line of its own.
 *
 * 40px leaves room for a mouse user's scrollbar under the chips. Touch scrollbars overlay the
 * content and take no room, so there the line is 32px.
 */
const STRIP_CLASS = "flex h-10 min-w-0 items-center gap-2 [@media(pointer:coarse)]:h-8"

/**
 * One-tap tag filter in the item grid's header. Each chip toggles that tag in the include-tags
 * filter, the same state the Filters panel edits. The chips stay on one line and scroll
 * sideways when there are too many.
 *
 * It always renders its line: a view with no tags says so below `md` (where the line is
 * visible on its own) and is simply blank from `md` up. Callers that never want the line,
 * such as an account with no tags at all, should not render the component.
 */
export default function TagQuickFilter({
  tags,
  activeTagIds,
  onToggle,
  loading = false,
  className,
}: TagQuickFilterProps) {
  const seenLoading = useSeenLoading(loading)

  if (tags.length === 0) {
    return (
      // Size and colour stay out of `cn`: tailwind-merge reads `text-fluid-*` as a colour and drops it.
      <div className={cn(STRIP_CLASS, "md:invisible", className)}>
        <span className="shrink-0 text-fluid-xs text-muted-foreground">Tags</span>
        {loading ? null : (
          <span className={`truncate text-fluid-xs text-muted-foreground ${seenLoading ? LOADED_FADE_CLASS : ""}`}>
            None in this view
          </span>
        )}
      </div>
    )
  }

  const active = new Set(activeTagIds)
  const anyActive = tags.some((tag) => active.has(tag.id))

  return (
    <div role="group" aria-label="Filter items by tag" className={cn(STRIP_CLASS, className)}>
      <span className="shrink-0 text-fluid-xs text-muted-foreground">Tags</span>
      {/* The padding gives a chip's focus ring room inside the scroll box; the margin takes it back. */}
      <div
        className={cn(
          "sk-scroll-x -mx-1 flex h-full min-w-0 flex-1 items-center gap-1.5 px-1",
          seenLoading && LOADED_FADE_CLASS
        )}
      >
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
                "max-w-[12rem] shrink-0 truncate rounded-md border-2 px-2 py-0.5 text-fluid-xs font-medium transition-opacity",
                FOCUS_RING_CLASS,
                // A 1px offset: the full ring would be clipped by the scroll box above a scrollbar.
                "focus-visible:ring-offset-1",
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
    </div>
  )
}
