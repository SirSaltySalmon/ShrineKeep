import {
  AUDIENCES,
  PRIVATE_SHARING_DEFAULTS,
  type Audience,
  type OwnerSharingSnapshot,
  type SharingSettings,
} from "./contracts"
import { isPublicBioValid, isPublicNicknameValid } from "./identity"

export type DashboardOwnerSharing =
  | { available: false }
  | ({ available: true } & OwnerSharingSnapshot)

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{8,128}$/

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

function sharingSettingsFromJson(value: unknown): SharingSettings | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null
  const body = value as Record<string, unknown>
  if (!isAudience(body.collectionVisibility) || !isAudience(body.wishlistVisibility) || typeof body.shareFinancials !== "boolean") {
    return null
  }
  return {
    collectionVisibility: body.collectionVisibility,
    wishlistVisibility: body.wishlistVisibility,
    shareFinancials: body.shareFinancials,
  }
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
  const root = sharingSettingsFromJson(body.root)
  const nickname = body.nickname === null || body.nickname === "" ? null : body.nickname
  const token = body.wishlistShareToken
  if (
    revision === null ||
    visible === null ||
    total === null ||
    !root ||
    !isPublicNicknameValid(nickname) ||
    !isPublicBioValid(body.bio) ||
    typeof body.profileShareStyle !== "boolean" ||
    typeof body.wishlistLinkEnabled !== "boolean" ||
    !(token === null || (typeof token === "string" && TOKEN_SHAPE.test(token)))
  ) {
    return null
  }
  return {
    available: true,
    nickname: typeof nickname === "string" ? nickname.trim() || null : null,
    bio: body.bio,
    profileShareStyle: body.profileShareStyle,
    root,
    wishlistLinkEnabled: body.wishlistLinkEnabled,
    wishlistShareToken: token,
    revision,
    wishlistGuestVisibleCount: visible,
    wishlistGuestTotalCount: total,
  }
}

const REVISION_SHAPE = /^\d{1,19}$/

/** Account-wide sharing revision is monotonic. Keep the later value when props lag a local write. */
export function laterSharingRevision(current: string, incoming: string | null | undefined): string {
  if (!incoming || !REVISION_SHAPE.test(incoming)) return current
  if (!REVISION_SHAPE.test(current)) return incoming
  return BigInt(incoming) > BigInt(current) ? incoming : current
}

/**
 * A direct `boxes` UPDATE fires `sharing_boxes_update_revision` even when only
 * name/description changed. That bump happens after `sharing_update_box` already
 * returned, so the PUT revision is one behind unless the follow-up GET is used.
 */
export function revisionAfterDirectBoxWrite(putRevision: string | null | undefined): string | null | undefined {
  if (!putRevision || !REVISION_SHAPE.test(putRevision)) return putRevision
  return String(BigInt(putRevision) + BigInt(1))
}

type AvailableOwnerSharing = Extract<DashboardOwnerSharing, { available: true }>

/** Merge a successful write into the dashboard snapshot even when a follow-up GET cannot be parsed. */
export function overlayOwnerSharingSnapshot(
  snapshot: AvailableOwnerSharing,
  writeRevision: string | null | undefined,
  fetched: AvailableOwnerSharing | null,
  patch?: Partial<Omit<AvailableOwnerSharing, "available" | "revision">>,
): AvailableOwnerSharing {
  const base = fetched ?? snapshot
  return {
    ...base,
    ...patch,
    revision: laterSharingRevision(base.revision, writeRevision),
  }
}
