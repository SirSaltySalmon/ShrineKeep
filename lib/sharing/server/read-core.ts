import type { CursorPage, OperationError, OperationResult, PublicBox, PublicCollectionItem, PublicProfile, PublicReadService, PublicWishlistItem, PublishedViewer } from "../contracts"
import { GUEST_VIEWER } from "../contracts"
import { decodeCursor, encodeCursor, type CursorScope } from "./cursor"

/** Server-only dependency boundary. Supply the service client; never a browser client. */
export type SharingRpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>
type Surface = "boxes" | "items" | "wishlist"
type Context = { revision: string; viewerCategory: CursorScope["viewerCategory"]; profile: PublicProfile }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const unavailable: OperationResult<never> = { ok: false, error: { code: "temporarily_unavailable", status: 503 } }
const invalid: OperationResult<never> = { ok: false, error: { code: "invalid_input", status: 400 } }

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
}
function nullableText(value: unknown): value is string | null { return value === null || typeof value === "string" }
function nullableNumber(value: unknown): value is number | null { return value === null || (typeof value === "number" && Number.isFinite(value)) }
function identity(value: unknown): value is string { return typeof value === "string" && uuid.test(value) }

/** All output objects are reconstructed; extra database fields cannot cross this boundary. */
function parseBox(value: unknown): PublicBox | null {
  const row = object(value)
  if (!row || !identity(row.id) || typeof row.name !== "string" || !nullableText(row.description) ||
    !(row.displayParentId === null || identity(row.displayParentId)) || typeof row.hasVisibleChildren !== "boolean") return null
  return { id: row.id, name: row.name, description: row.description, displayParentId: row.displayParentId, hasVisibleChildren: row.hasVisibleChildren }
}
function parseCollection(value: unknown): PublicCollectionItem | null {
  const row = object(value)
  if (!row || !identity(row.id) || typeof row.name !== "string" || !nullableText(row.description) || row.thumbnail !== null ||
    !nullableNumber(row.currentValue) || !nullableNumber(row.acquisitionPrice) || !nullableText(row.acquisitionDate)) return null
  return { id: row.id, name: row.name, description: row.description, thumbnail: null, currentValue: row.currentValue, acquisitionPrice: row.acquisitionPrice, acquisitionDate: row.acquisitionDate }
}
function parseWishlist(value: unknown): PublicWishlistItem | null {
  const row = object(value)
  if (!row || !identity(row.id) || typeof row.name !== "string" || !nullableText(row.description) || row.thumbnail !== null || !nullableNumber(row.expectedPrice)) return null
  let visibleTarget: PublicWishlistItem["visibleTarget"] = null
  if (row.visibleTarget !== null) {
    const target = object(row.visibleTarget)
    if (!target || !identity(target.id) || typeof target.name !== "string") return null
    visibleTarget = { id: target.id, name: target.name }
  }
  return { id: row.id, name: row.name, description: row.description, thumbnail: null, expectedPrice: row.expectedPrice, visibleTarget }
}
function parseContext(value: unknown): Context | null {
  const data = object(value)
  const profile = object(data?.profile)
  if (!data || typeof data.revision !== "string" || !/^\d{1,19}$/.test(data.revision) ||
    !["guest", "owner", "friend", "stranger"].includes(String(data.viewerCategory)) ||
    !profile || !identity(profile.id) || typeof profile.nickname !== "string" || typeof profile.bio !== "string" ||
    profile.avatar !== null || profile.sharedStyle !== null ||
    !["self", "none", "outgoing_pending", "incoming_pending", "friends"].includes(String(profile.relationship))) return null
  return { revision: data.revision, viewerCategory: data.viewerCategory as Context["viewerCategory"],
    profile: { id: profile.id, nickname: profile.nickname, bio: profile.bio, avatar: null, sharedStyle: null, relationship: profile.relationship as PublicProfile["relationship"] } }
}

function failure(value: unknown): OperationResult<never> {
  const error = object(object(value)?.error)
  const codes = { invalid_input: 400, not_found: 404, cursor_reset: 409 } as const
  if (error && typeof error.code === "string" && Object.prototype.hasOwnProperty.call(codes, error.code)) {
    const code = error.code as keyof typeof codes
    return { ok: false, error: { code, status: codes[code] } as OperationError }
  }
  return unavailable
}

/** Partial T02 implementation. Media, style, details, stats and token resolution follow. */
export function createPublicReadCore(rpc: SharingRpc, cursorSecret: string): Pick<PublicReadService, "profile" | "boxes" | "collectionItems" | "wishlist" | "previewWishlist"> {
  async function context(ownerId: string, viewer: PublishedViewer): Promise<OperationResult<Context>> {
    if (!identity(ownerId) || (viewer.kind === "authenticated" && !identity(viewer.userId))) return invalid
    const response = await rpc("sharing_read_context", { p_owner_id: ownerId, p_viewer_id: viewer.kind === "guest" ? null : viewer.userId })
    if (response.error) return unavailable
    const envelope = object(response.data)
    if (envelope?.ok !== true) return failure(response.data)
    const data = parseContext(envelope.data)
    return data && data.profile.id.toLowerCase() === ownerId.toLowerCase() ? { ok: true, data } : unavailable
  }

  async function page<T>(ownerId: string, viewer: PublishedViewer, surface: Surface, parentId: string | undefined, cursor: string | undefined, parse: (value: unknown) => T | null): Promise<OperationResult<CursorPage<T>>> {
    try {
      if (parentId !== undefined && !identity(parentId)) return invalid
      const current = await context(ownerId, viewer)
      if (!current.ok) return current
      const scope: CursorScope = { ownerId, viewer, viewerCategory: current.data.viewerCategory, surface,
        sort: surface === "wishlist" ? "created_at,id:desc" : "position,id:asc", search: "", filters: JSON.stringify({ parentId: parentId ?? null }), revision: current.data.revision }
      let afterKey: { value: string | number | null; id: string } | null = null
      if (cursor !== undefined) {
        const decoded = decodeCursor(cursor, scope, cursorSecret)
        if (!decoded.ok) return decoded.code === "cursor_reset" ? { ok: false, error: { code: "cursor_reset", status: 409 } } : invalid
        afterKey = decoded.cursor.lastKey
        if (!validKey(afterKey, surface)) return invalid
      }
      const response = await rpc("sharing_read_page", { p_owner_id: ownerId, p_viewer_id: viewer.kind === "guest" ? null : viewer.userId,
        p_surface: surface, p_parent_id: parentId ?? null, p_after_key: afterKey, p_expected_revision: current.data.revision })
      if (response.error) return unavailable
      const envelope = object(response.data)
      if (envelope?.ok !== true) return failure(response.data)
      const data = object(envelope.data)
      if (!data || data.revision !== scope.revision || data.viewerCategory !== scope.viewerCategory || !Array.isArray(data.rows) || data.rows.length > 21) return unavailable
      const rows: Array<{ item: T; key: { value: string | number | null; id: string } }> = []
      for (const value of data.rows) {
        const row = object(value)
        const item = parse(row?.item)
        const key = object(row?.key)
        if (!item || !key || !validKey(key, surface) || object(row?.item)?.id !== key.id) return unavailable
        rows.push({ item, key: { value: key.value as string | number, id: key.id as string } })
      }
      const entries = rows.slice(0, 20).map(row => row.item)
      const hasMore = rows.length > 20
      return { ok: true, data: { entries, hasMore, nextCursor: hasMore ? encodeCursor(scope, rows[19].key, cursorSecret) : null } }
    } catch { return unavailable }
  }

  return {
    async profile(ownerId, viewer) {
      try {
        const result = await context(ownerId, viewer)
        return result.ok ? { ok: true, data: result.data.profile } : result
      } catch { return unavailable }
    },
    boxes: (ownerId, viewer, request) => page(ownerId, viewer, "boxes", request.parentId, request.cursor, parseBox),
    collectionItems: (ownerId, viewer, request) => page(ownerId, viewer, "items", request.boxId, request.cursor, parseCollection),
    wishlist: (ownerId, viewer, request) => page(ownerId, viewer, "wishlist", undefined, request.cursor, parseWishlist),
    previewWishlist: (sessionOwnerId, request) => page(sessionOwnerId, GUEST_VIEWER, "wishlist", undefined, request.cursor, parseWishlist),
  }
}

function validKey(key: Record<string, unknown>, surface: Surface): boolean {
  if (!identity(key.id)) return false
  return surface === "wishlist"
    ? typeof key.value === "string" && key.value.length <= 40 && /^\d{4}-\d{2}-\d{2}T/.test(key.value) && Number.isFinite(Date.parse(key.value))
    : typeof key.value === "number" && Number.isInteger(key.value) && key.value >= -2147483648 && key.value <= 2147483647
}
