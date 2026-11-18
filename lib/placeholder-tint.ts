import { TAG_COLORS, type TagColor } from "./types"

/** The two fields of a tag that decide the tint. `Tag` and `PresentedTag` both fit. */
export interface TintTag {
  name?: string | null
  color?: TagColor | null
}

/** Inline colours for a no-photo thumbnail tile and its icon. */
export interface PlaceholderTint {
  background: string
  color: string
}

/** Strength of the tag colour washed over the tile. */
const TINT_ALPHA = 0.16

const COLOR_ORDER = TAG_COLORS as readonly string[]

function toSlot(color: TagColor | null | undefined): TagColor {
  return color && COLOR_ORDER.includes(color) ? color : "blue"
}

/**
 * Colour slot of the first tag in the app's canonical tag order (rainbow order,
 * then name: the order `sortTagsByColorThenName` produces), or null when there
 * are no tags. Does not rely on the input already being sorted, so the tint is
 * the same wherever the item is rendered.
 */
export function pickTintColor(tags: readonly TintTag[] | null | undefined): TagColor | null {
  if (!tags || tags.length === 0) return null
  let best = tags[0]
  let bestRank = COLOR_ORDER.indexOf(toSlot(best.color))
  for (let i = 1; i < tags.length; i++) {
    const tag = tags[i]
    const rank = COLOR_ORDER.indexOf(toSlot(tag.color))
    if (rank < bestRank || (rank === bestRank && (tag.name ?? "").localeCompare(best.name ?? "") < 0)) {
      best = tag
      bestRank = rank
    }
  }
  return toSlot(best.color)
}

/**
 * Tint for a no-photo placeholder, or null to keep the plain muted tile.
 *
 * Returns `var()` references rather than resolved colours (unlike
 * `getTagChipStyle`, which reads the document root), so it works during SSR and
 * under a theme scoped to a wrapper element.
 */
export function getPlaceholderTint(tags: readonly TintTag[] | null | undefined): PlaceholderTint | null {
  const slot = pickTintColor(tags)
  if (!slot) return null
  return {
    background: `hsl(var(--tag-${slot}) / ${TINT_ALPHA})`,
    color: `hsl(var(--tag-${slot}))`,
  }
}
