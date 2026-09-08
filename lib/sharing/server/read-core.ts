import type { CursorPage, OperationError, OperationResult, PublicBox, PublicCollectionItem, PublicDetailRequest, PublicItemDetail, PublicMedia, PublicProfile, PublicReadService, PublicWishlistItem, PublishedViewer } from "../contracts"
import { GUEST_VIEWER } from "../contracts"
import { TAG_COLORS, type TagColor } from "@/lib/types"
import { decodeCursor, encodeCursor, type CursorScope } from "./cursor"

/** Server-only dependency boundary. Supply the service client; never a browser client. */
export type SharingRpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>
export type PublicMediaResolver = (kind: "photo" | "avatar", referenceId: string, viewer: PublishedViewer) => Promise<OperationResult<PublicMedia>>
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

/** T02 safe projections. Stats, styles and token resolution remain separate work. */
export function createPublicReadCore(rpc: SharingRpc, cursorSecret: string, media?: PublicMediaResolver): Pick<PublicReadService, "profile" | "boxes" | "collectionItems" | "collectionItem" | "wishlistItem" | "wishlist" | "previewWishlist"> {
  async function photo(referenceId: unknown, viewer: PublishedViewer): Promise<PublicMedia | null> {
    if (referenceId === null || referenceId === undefined) return null
    if (!identity(referenceId) || !media) throw new Error("Invalid media reference")
    const result = await media("photo", referenceId, viewer)
    if (!result.ok) {
      if (result.error.code === "not_found") return null
      throw new Error("Media unavailable")
    }
    if (result.data.referenceId !== referenceId) throw new Error("Mismatched media reference")
    return { referenceId, url: result.data.url, expiresAt: result.data.expiresAt }
  }
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
      // Authorize only displayed rows, never the internal lookahead. Keep signing bounded.
      if (surface !== "boxes") {
        for (let offset = 0; offset < entries.length; offset += 4) {
          await Promise.all(entries.slice(offset, offset + 4).map(async (entry, localIndex) => {
            const item = entry as PublicCollectionItem | PublicWishlistItem
            item.thumbnail = await photo(object(object(data.rows[offset + localIndex])?.item)?.thumbnailReferenceId, viewer)
          }))
        }
      }
      const hasMore = rows.length > 20
      return { ok: true, data: { entries, hasMore, nextCursor: hasMore ? encodeCursor(scope, rows[19].key, cursorSecret) : null } }
    } catch { return unavailable }
  }

  async function detail<T extends PublicCollectionItem | PublicWishlistItem>(ownerId: string, viewer: PublishedViewer, itemId: string,
    surface: "items" | "wishlist", request: PublicDetailRequest, parse: (value: unknown) => T | null): Promise<OperationResult<PublicItemDetail<T>>> {
    try {
      if (!identity(itemId)) return invalid
      const current = await context(ownerId, viewer)
      if (!current.ok) return current
      const scope = (resource: "photos" | "tags"): CursorScope => ({ ownerId, viewer, viewerCategory: current.data.viewerCategory,
        surface: resource, sort: resource === "photos" ? "uploaded_at,id:asc" : "id:asc", search: "",
        filters: JSON.stringify({ itemId, surface }), revision: current.data.revision })
      const keys: Record<"photos" | "tags", { value: string | number | null; id: string } | null> = { photos: null, tags: null }
      for (const resource of ["photos", "tags"] as const) {
        const cursor = resource === "photos" ? request.photosCursor : request.tagsCursor
        if (cursor === undefined) continue
        const decoded = decodeCursor(cursor, scope(resource), cursorSecret)
        if (!decoded.ok) return decoded.code === "cursor_reset" ? { ok: false, error: { code: "cursor_reset", status: 409 } } : invalid
        if (!validDetailKey(decoded.cursor.lastKey, resource)) return invalid
        keys[resource] = decoded.cursor.lastKey
      }
      const response = await rpc("sharing_read_item_detail", { p_owner_id: ownerId, p_viewer_id: viewer.kind === "guest" ? null : viewer.userId,
        p_item_id: itemId, p_surface: surface, p_photos_after_key: keys.photos, p_tags_after_key: keys.tags, p_expected_revision: current.data.revision })
      if (response.error) return unavailable
      const envelope = object(response.data)
      if (envelope?.ok !== true) return failure(response.data)
      const data = object(envelope.data)
      const item = parse(data?.item)
      if (!data || !item || item.id.toLowerCase() !== itemId.toLowerCase() || data.revision !== current.data.revision
        || data.viewerCategory !== current.data.viewerCategory || !Array.isArray(data.photos) || data.photos.length > 21
        || !Array.isArray(data.tags) || data.tags.length > 21) return unavailable
      const photoRows = data.photos.map(value => {
        const row = object(value); const key = object(row?.key)
        if (!row || !identity(row.referenceId) || !key || !validDetailKey(key, "photos") || key.id !== row.referenceId) throw new Error("Invalid photo")
        return { referenceId: row.referenceId, key: { id: key.id as string, value: key.value as string } }
      })
      const tagRows = data.tags.map(value => {
        const row = object(value); const key = object(row?.key)
        if (!row || typeof row.name !== "string" || !TAG_COLORS.includes(row.color as TagColor) || !key || !validDetailKey(key, "tags")) throw new Error("Invalid tag")
        return { item: { name: row.name, color: row.color as TagColor }, key: { id: key.id as string, value: null } }
      })
      const photos: PublicMedia[] = []
      for (let offset = 0; offset < Math.min(photoRows.length, 20); offset += 4) {
        const batch = await Promise.all(photoRows.slice(offset, Math.min(offset + 4, 20)).map(row => photo(row.referenceId, viewer)))
        photos.push(...batch.filter((entry): entry is PublicMedia => entry !== null))
      }
      const thumbnailReferenceId = object(data.item)?.thumbnailReferenceId
      item.thumbnail = photos.find(entry => entry.referenceId === thumbnailReferenceId) ?? await photo(thumbnailReferenceId, viewer)
      return { ok: true, data: { item,
        photos: { entries: photos, hasMore: photoRows.length > 20, nextCursor: photoRows.length > 20 ? encodeCursor(scope("photos"), photoRows[19].key, cursorSecret) : null },
        tags: { entries: tagRows.slice(0, 20).map(row => row.item), hasMore: tagRows.length > 20, nextCursor: tagRows.length > 20 ? encodeCursor(scope("tags"), tagRows[19].key, cursorSecret) : null },
      } }
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
    collectionItem: (ownerId, viewer, itemId, request) => detail(ownerId, viewer, itemId, "items", request, parseCollection),
    wishlistItem: (ownerId, viewer, itemId, request) => detail(ownerId, viewer, itemId, "wishlist", request, parseWishlist),
    wishlist: (ownerId, viewer, request) => page(ownerId, viewer, "wishlist", undefined, request.cursor, parseWishlist),
    previewWishlist: (sessionOwnerId, request) => page(sessionOwnerId, GUEST_VIEWER, "wishlist", undefined, request.cursor, parseWishlist),
  }
}

function validDetailKey(key: Record<string, unknown>, resource: "photos" | "tags"): boolean {
  return resource === "photos" ? validKey(key, "wishlist") : identity(key.id) && key.value === null
}

function validKey(key: Record<string, unknown>, surface: Surface): boolean {
  if (!identity(key.id)) return false
  return surface === "wishlist"
    ? typeof key.value === "string" && key.value.length <= 40 && /^\d{4}-\d{2}-\d{2}T/.test(key.value) && Number.isFinite(Date.parse(key.value))
    : typeof key.value === "number" && Number.isInteger(key.value) && key.value >= -2147483648 && key.value <= 2147483647
}
