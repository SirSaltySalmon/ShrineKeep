import {
  AUDIENCES,
  PRIVATE_SHARING_DEFAULTS,
  type Audience,
  type SharingSettings,
} from "./contracts"

export type DashboardOwnerSharing =
  | { available: false }
  | {
      available: true
      revision: string
      wishlistGuestVisibleCount: number
      wishlistGuestTotalCount: number
    }

export interface BoxTreeRow {
  id: string
  parent_box_id?: string | null
}

function isAudience(value: unknown): value is Audience {
  return typeof value === "string" && (AUDIENCES as readonly string[]).includes(value)
}

function asCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value
  if (typeof value === "string" && /^\d{1,15}$/.test(value)) return Number(value)
  return null
}

function asRevision(value: unknown): string | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value)
  if (typeof value === "string" && /^\d{1,19}$/.test(value)) return value
  return null
}

/** Map a boxes-table row to editor settings. Missing columns stay private. */
export function sharingSettingsFromBoxRow(row: Record<string, unknown>): SharingSettings {
  const collection = row.collection_visibility
  const wishlist = row.wishlist_visibility
  const financials = row.share_financials
  if (!isAudience(collection) || !isAudience(wishlist) || typeof financials !== "boolean") {
    return { ...PRIVATE_SHARING_DEFAULTS }
  }
  return {
    collectionVisibility: collection,
    wishlistVisibility: wishlist,
    shareFinancials: financials,
  }
}

/** Count every descendant of each box. Cycles count as zero extra descendants. */
export function countDescendantsById(rows: BoxTreeRow[]): Record<string, number> {
  const children = new Map<string, string[]>()
  for (const row of rows) {
    if (!row.parent_box_id) continue
    const list = children.get(row.parent_box_id) ?? []
    list.push(row.id)
    children.set(row.parent_box_id, list)
  }
  const memo = new Map<string, number>()
  const visiting = new Set<string>()
  const count = (id: string): number => {
    const cached = memo.get(id)
    if (cached !== undefined) return cached
    if (visiting.has(id)) return 0
    visiting.add(id)
    let total = 0
    for (const child of children.get(id) ?? []) {
      total += 1 + count(child)
    }
    visiting.delete(id)
    memo.set(id, total)
    return total
  }
  for (const row of rows) count(row.id)
  return Object.fromEntries(memo)
}

export function normalizeBox<T extends { id: string }>(
  row: T,
  descendantCounts: Record<string, number> = {},
): T & { sharing: SharingSettings; descendant_count: number } {
  return {
    ...row,
    sharing: sharingSettingsFromBoxRow(row as Record<string, unknown>),
    descendant_count: descendantCounts[row.id] ?? 0,
  }
}

export function parseOwnerSharingSummary(value: unknown): Extract<DashboardOwnerSharing, { available: true }> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null
  const body = value as Record<string, unknown>
  const revision = asRevision(body.revision)
  const visible = asCount(body.wishlistGuestVisibleCount)
  const total = asCount(body.wishlistGuestTotalCount)
  if (revision === null || visible === null || total === null) return null
  return {
    available: true,
    revision,
    wishlistGuestVisibleCount: visible,
    wishlistGuestTotalCount: total,
  }
}
