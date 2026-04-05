import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Item, ItemCopyPayload, Tag, TagColor } from "./types"
import type { SearchFiltersState } from "./types"
import { TAG_COLORS } from "./types"

/** Canonical ring: ring-2 ring-primary ring-offset-2. Keep SELECTION_RING_CLASS and FOCUS_RING_CLASS in sync. */
export const SELECTION_RING_CLASS = "ring-2 ring-primary ring-offset-2"

/** Focus-visible ring for inputs/controls; same ring as SELECTION_RING_CLASS. Update both when changing the ring. */
export const FOCUS_RING_CLASS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"

/** Lighter ring on hover for selectables (items, boxes) when in selection mode. Color from theme (--selectable-hover-ring). Ring only, no offset fill. */
export const SELECTABLE_HOVER_RING_CLASS =
  "hover:ring-2 hover:ring-selectable-hover-ring hover:ring-offset-0 hover:relative hover:z-10"

/**
 * Ring classes for selectable elements (item cards, box cards, theme preview).
 * When showFullRing (e.g. selected or drop target), returns full selection ring.
 * Otherwise when selectionMode, returns lighter hover ring.
 */
export function getSelectableRingClasses(showFullRing: boolean, selectionMode: boolean): string {
  if (showFullRing) return SELECTION_RING_CLASS
  if (selectionMode) return SELECTABLE_HOVER_RING_CLASS
  return ""
}

/** Build /dashboard/search URL from query, filters, and optional page. Use from dashboard and search page. */
export function buildSearchUrl(q: string, filters: SearchFiltersState, page?: number): string {
  const params = new URLSearchParams()
  if (q?.trim()) params.set("q", q.trim())
  if (filters.includeTags.length) params.set("includeTags", filters.includeTags.join(","))
  if (filters.excludeTags.length) params.set("excludeTags", filters.excludeTags.join(","))
  if (filters.valueMin) params.set("valueMin", filters.valueMin)
  if (filters.valueMax) params.set("valueMax", filters.valueMax)
  if (filters.acquisitionMin) params.set("acquisitionMin", filters.acquisitionMin)
  if (filters.acquisitionMax) params.set("acquisitionMax", filters.acquisitionMax)
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom)
  if (filters.dateTo) params.set("dateTo", filters.dateTo)
  if (filters.tagColors.length) params.set("tagColors", filters.tagColors.join(","))
  if (page != null && page > 1) params.set("page", String(page))
  const s = params.toString()
  return s ? `/dashboard/search?${s}` : "/dashboard/search"
}

/** Tag text color from theme (--tag-foreground). Use for text inside tag chips. */
export function getTagForeground(): string {
  if (typeof document === "undefined") return "hsl(0 0% 100%)"
  const v = getComputedStyle(document.documentElement).getPropertyValue("--tag-foreground").trim()
  return v ? `hsl(${v})` : "hsl(0 0% 100%)"
}

/** Background and text color for a tag chip from theme. Use everywhere tag chips are rendered. */
export function getTagChipStyle(color: TagColor): { background: string; color: string } {
  if (typeof document === "undefined") return { background: "hsl(217 91% 60%)", color: "hsl(0 0% 100%)" }
  const root = document.documentElement
  const bg = getComputedStyle(root).getPropertyValue(`--tag-${color ?? "blue"}`).trim()
  const fg = getComputedStyle(root).getPropertyValue("--tag-foreground").trim()
  return {
    background: bg ? `hsl(${bg})` : "hsl(217 91% 60%)",
    color: fg ? `hsl(${fg})` : "hsl(0 0% 100%)",
  }
}

/** Sort tags by color (rainbow order) then alphabetically by name. Use wherever tags are listed. */
export function sortTagsByColorThenName(tags: Tag[]): Tag[] {
  const colorOrder = TAG_COLORS as readonly string[]
  return [...tags].sort((a, b) => {
    const ai = colorOrder.indexOf(a.color ?? "blue")
    const bi = colorOrder.indexOf(b.color ?? "blue")
    if (ai !== bi) return ai - bi
    return (a.name ?? "").localeCompare(b.name ?? "")
  })
}

export function buildAllItemsCopyPayload(
  items: Item[],
  valueHistoryMap?: Map<string, Array<{ value: number; recorded_at: string }>>
): ItemCopyPayload[] {
  return items.map((item) => buildItemCopyPayload(item, valueHistoryMap?.get(item.id)))
}

/** Build payload for duplicating an item (copy/paste). */
export function buildItemCopyPayload(
  item: Item,
  valueHistory?: { value: number; recorded_at: string }[]
): ItemCopyPayload {
  const photos = (item.photos ?? []).length
    ? (item.photos ?? []).map((p) => ({
        url: p.url,
        storage_path: (p as { storage_path?: string }).storage_path,
        is_thumbnail: p.is_thumbnail ?? false,
      }))
    : item.thumbnail_url
      ? [{ url: item.thumbnail_url, is_thumbnail: true }]
      : []
  return {
    name: item.name,
    description: item.description ?? null,
    current_value: item.current_value ?? null,
    acquisition_date: item.acquisition_date ?? null,
    acquisition_price: item.acquisition_price ?? null,
    expected_price: item.expected_price ?? null,
    thumbnail_url: item.thumbnail_url ?? null,
    is_wishlist: item.is_wishlist,
    wishlist_target_box_id: item.wishlist_target_box_id ?? null,
    photos,
    tag_ids: (item.tags ?? []).map((t) => t.id),
    value_history: valueHistory,
  }
}

/** Supabase returns item_tags as { tag_id, tag: Tag }[]; normalize to item.tags = Tag[] */
export function normalizeItem<T extends Record<string, unknown>>(row: T): T & { tags: Tag[] } {
  const item = { ...row } as T & { item_tags?: { tag: Tag }[]; tags?: Tag[] }
  const itemTags = item.item_tags as { tag: Tag }[] | undefined
  const rawTags = itemTags?.map((it) => it.tag).filter(Boolean) ?? []
  item.tags = sortTagsByColorThenName(rawTags as Tag[])
  delete (item as Record<string, unknown>).item_tags
  return item as T & { tags: Tag[] }
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatDate(value: string | Date | undefined | null): string {
  if (value == null || value === "") return ""
  const date = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date)
}
