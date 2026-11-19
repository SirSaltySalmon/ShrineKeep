import type { Item, SearchFiltersState, Tag } from "./types"
import { sortTagsByColorThenName } from "./utils"

type TaggedItem = Pick<Item, "tags">

/** Distinct tags carried by `items`, in the app's canonical order (rainbow, then name). */
export function collectItemTags(items: readonly TaggedItem[]): Tag[] {
  const byId = new Map<string, Tag>()
  for (const item of items) {
    for (const tag of item.tags ?? []) {
      if (!byId.has(tag.id)) byId.set(tag.id, tag)
    }
  }
  return sortTagsByColorThenName(Array.from(byId.values()))
}

/**
 * The include-tags that can actually narrow `items`: the ones at least one of them carries.
 * Include-tags are shared with the global search filters, so some may belong to other boxes;
 * those are ignored here instead of emptying the grid.
 */
export function getEffectiveIncludeTagIds(
  items: readonly TaggedItem[],
  includeTags: readonly string[],
): string[] {
  if (includeTags.length === 0) return []
  const present = new Set<string>()
  for (const item of items) {
    for (const tag of item.tags ?? []) present.add(tag.id)
  }
  return includeTags.filter((id) => present.has(id))
}

/**
 * Local include-tags filter, "item has any" like the search page. Returns `items` itself
 * (same reference) when no include-tag applies to this list, so the result is never empty
 * unless `items` already was.
 */
export function filterItemsByIncludeTags<T extends TaggedItem>(
  items: T[],
  includeTags: readonly string[],
): T[] {
  const effective = getEffectiveIncludeTagIds(items, includeTags)
  if (effective.length === 0) return items
  const wanted = new Set(effective)
  return items.filter((item) => item.tags?.some((tag) => wanted.has(tag.id)) ?? false)
}

/**
 * Ids of the loaded items that no grid is showing: everything in `loaded` that is missing
 * from `visible`. It compares what was fetched with what is drawn, so it covers every local
 * filter at once: the tag chips, and the in-box search over wishlist items.
 */
export function getHiddenItemIds(
  loaded: readonly Pick<Item, "id">[],
  visible: readonly Pick<Item, "id">[],
): string[] {
  const shown = new Set(visible.map((item) => item.id))
  return loaded.filter((item) => !shown.has(item.id)).map((item) => item.id)
}

/** Add `tagId` to the include-tags filter, or remove it when already there. */
export function toggleIncludeTag(filters: SearchFiltersState, tagId: string): SearchFiltersState {
  const includeTags = filters.includeTags.includes(tagId)
    ? filters.includeTags.filter((id) => id !== tagId)
    : [...filters.includeTags, tagId]
  return { ...filters, includeTags }
}
