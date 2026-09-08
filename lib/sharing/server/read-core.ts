import type { CursorPage, OperationError, OperationResult, PublicBox, PublicBoxStats, PublicCollectionItem, PublicDetailRequest, PublicItemDetail, PublicMedia, PublicProfile, PublicReadService, PublicStyle, PublicWishlistItem, PublishedViewer } from "../contracts"
import { GUEST_VIEWER, SHARING_LIMITS } from "../contracts"
import { FONT_OPTIONS, type FontFamilyId } from "@/lib/fonts"
import { THEME_COLOR_KEYS } from "@/lib/theme-colors"
import { TAG_COLORS, type TagColor, type Theme } from "@/lib/types"
import { decodeCursor, encodeCursor, type CursorScope } from "./cursor"

/** Server-only dependency boundary. Supply the service client; never a browser client. */
export type SharingRpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>
export type PublicMediaResolver = (kind: "photo" | "avatar", referenceId: string, viewer: PublishedViewer) => Promise<OperationResult<PublicMedia>>
type Surface = "boxes" | "items" | "wishlist"
type Context = { revision: string; viewerCategory: CursorScope["viewerCategory"]; profile: PublicProfile; avatarReferenceId: string | null }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const tokenShape = /^[A-Za-z0-9_-]{8,128}$/
const hsl = /^-?\d+(?:\.\d+)?(?:\s+-?\d+(?:\.\d+)?%){2}$/
const fonts = new Set<string>(FONT_OPTIONS.map(option => option.value))
const radii = new Set(["0", "0.25rem", "0.5rem", "0.75rem"])
const themeKeys = new Set<string>(THEME_COLOR_KEYS)
const unavailable: OperationResult<never> = { ok: false, error: { code: "temporarily_unavailable", status: 503 } }
const invalid: OperationResult<never> = { ok: false, error: { code: "invalid_input", status: 400 } }

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
}
function nullableText(value: unknown): value is string | null { return value === null || typeof value === "string" }
function nullableNumber(value: unknown): value is number | null { return value === null || (typeof value === "number" && Number.isFinite(value)) }
function identity(value: unknown): value is string { return typeof value === "string" && uuid.test(value) }
function finiteAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value)) {
    const amount = Number(value)
    return Number.isFinite(amount) ? amount : null
  }
  return null
}
function calendarDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split("-").map(Number)
  const utc = new Date(Date.UTC(year, month - 1, day))
  return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day ? value : null
}
function parseStats(value: unknown): PublicBoxStats | null {
  const row = object(value)
  const currentValue = finiteAmount(row?.currentValue)
  const totalAcquisition = finiteAmount(row?.totalAcquisition)
  if (!row || currentValue === null || totalAcquisition === null || (row.bucket !== "day" && row.bucket !== "month" && row.bucket !== "year")
    || !Array.isArray(row.valueHistory) || !Array.isArray(row.acquisitionHistory)
    || row.valueHistory.length > SHARING_LIMITS.maxChartPoints || row.acquisitionHistory.length > SHARING_LIMITS.maxChartPoints) return null
  const valueHistory: PublicBoxStats["valueHistory"] = []
  for (const point of row.valueHistory) {
    const entry = object(point)
    const date = calendarDate(entry?.date)
    const amount = finiteAmount(entry?.value)
    if (!entry || !date || amount === null) return null
    valueHistory.push({ date, value: amount })
  }
  const acquisitionHistory: PublicBoxStats["acquisitionHistory"] = []
  for (const point of row.acquisitionHistory) {
    const entry = object(point)
    const date = calendarDate(entry?.date)
    const amount = finiteAmount(entry?.cumulativeAcquisition)
    if (!entry || !date || amount === null) return null
    acquisitionHistory.push({ date, cumulativeAcquisition: amount })
  }
  return { currentValue, totalAcquisition, valueHistory, acquisitionHistory, bucket: row.bucket }
}

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
function parseFont(value: unknown): FontFamilyId | null {
  return typeof value === "string" && fonts.has(value) ? value as FontFamilyId : null
}
function parseStyle(value: unknown): PublicStyle | null {
  if (value === null || value === undefined) return null
  const row = object(value)
  if (!row) return null
  const scheme = object(row.colorScheme) ?? {}
  const colorScheme: Theme = {}
  for (const [key, token] of Object.entries(scheme)) {
    if (!themeKeys.has(key) || typeof token !== "string" || token.length > 40 || !hsl.test(token)) continue
    colorScheme[key as keyof Theme] = token
  }
  const borderRadius = typeof row.borderRadius === "string" && radii.has(row.borderRadius) ? row.borderRadius : null
  return { colorScheme, headerFontFamily: parseFont(row.headerFontFamily), bodyFontFamily: parseFont(row.bodyFontFamily), borderRadius }
}
function parseContext(value: unknown): Context | null {
  const data = object(value)
  const profile = object(data?.profile)
  if (!data || typeof data.revision !== "string" || !/^\d{1,19}$/.test(data.revision) ||
    !["guest", "owner", "friend", "stranger"].includes(String(data.viewerCategory)) ||
    !profile || !identity(profile.id) || typeof profile.nickname !== "string" || typeof profile.bio !== "string" ||
    profile.avatar !== null ||
    (profile.avatarReferenceId !== undefined && profile.avatarReferenceId !== null && !identity(profile.avatarReferenceId)) ||
    !["self", "none", "outgoing_pending", "incoming_pending", "friends"].includes(String(profile.relationship))) return null
  const avatarReferenceId = profile.avatarReferenceId === undefined || profile.avatarReferenceId === null ? null : String(profile.avatarReferenceId)
  if (avatarReferenceId && avatarReferenceId.toLowerCase() !== profile.id.toLowerCase()) return null
  return { revision: data.revision, viewerCategory: data.viewerCategory as Context["viewerCategory"], avatarReferenceId,
    profile: { id: profile.id, nickname: profile.nickname, bio: profile.bio, avatar: null, sharedStyle: parseStyle(profile.sharedStyle),
      relationship: profile.relationship as PublicProfile["relationship"] } }
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

/** T02/T07 safe projections. */
export function createPublicReadCore(rpc: SharingRpc, cursorSecret: string, media?: PublicMediaResolver): Pick<PublicReadService, "profile" | "boxes" | "collectionItems" | "collectionItem" | "wishlistItem" | "wishlist" | "previewWishlist" | "tokenWishlist" | "stats"> {
  async function resolveMedia(kind: "photo" | "avatar", referenceId: unknown, viewer: PublishedViewer): Promise<PublicMedia | null> {
    if (referenceId === null || referenceId === undefined) return null
    if (!identity(referenceId) || !media) throw new Error("Invalid media reference")
    const result = await media(kind, referenceId, viewer)
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
            item.thumbnail = await resolveMedia("photo", object(object(data.rows[offset + localIndex])?.item)?.thumbnailReferenceId, viewer)
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
        const batch = await Promise.all(photoRows.slice(offset, Math.min(offset + 4, 20)).map(row => resolveMedia("photo", row.referenceId, viewer)))
        photos.push(...batch.filter((entry): entry is PublicMedia => entry !== null))
      }
      const thumbnailReferenceId = object(data.item)?.thumbnailReferenceId
      item.thumbnail = photos.find(entry => entry.referenceId === thumbnailReferenceId) ?? await resolveMedia("photo", thumbnailReferenceId, viewer)
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
        if (!result.ok) return result
        result.data.profile.avatar = await resolveMedia("avatar", result.data.avatarReferenceId, viewer)
        return { ok: true, data: result.data.profile }
      } catch { return unavailable }
    },
    boxes: (ownerId, viewer, request) => page(ownerId, viewer, "boxes", request.parentId, request.cursor, parseBox),
    collectionItems: (ownerId, viewer, request) => page(ownerId, viewer, "items", request.boxId, request.cursor, parseCollection),
    collectionItem: (ownerId, viewer, itemId, request) => detail(ownerId, viewer, itemId, "items", request, parseCollection),
    wishlistItem: (ownerId, viewer, itemId, request) => detail(ownerId, viewer, itemId, "wishlist", request, parseWishlist),
    wishlist: (ownerId, viewer, request) => page(ownerId, viewer, "wishlist", undefined, request.cursor, parseWishlist),
    previewWishlist: (sessionOwnerId, request) => page(sessionOwnerId, GUEST_VIEWER, "wishlist", undefined, request.cursor, parseWishlist),
    async tokenWishlist(token, viewer, request) {
      try {
        if (typeof token !== "string" || !tokenShape.test(token) || (viewer.kind === "authenticated" && !identity(viewer.userId))) return invalid
        const response = await rpc("sharing_resolve_wishlist_token", { p_token: token, p_viewer_id: viewer.kind === "guest" ? null : viewer.userId })
        if (response.error) return unavailable
        const envelope = object(response.data)
        if (envelope?.ok !== true) return failure(response.data)
        const ownerId = object(envelope.data)?.ownerId
        if (!identity(ownerId)) return unavailable
        return page(ownerId, viewer, "wishlist", undefined, request.cursor, parseWishlist)
      } catch { return unavailable }
    },
    async stats(ownerId, viewer, request) {
      try {
        if (!identity(ownerId) || (viewer.kind === "authenticated" && !identity(viewer.userId))) return invalid
        if (request.boxId !== undefined && !identity(request.boxId)) return invalid
        const fromDate = request.fromDate === undefined ? undefined : calendarDate(request.fromDate)
        const toDate = request.toDate === undefined ? undefined : calendarDate(request.toDate)
        if (fromDate === null || toDate === null || (fromDate && toDate && fromDate > toDate)) return invalid
        const response = await rpc("sharing_read_stats", {
          p_owner_id: ownerId, p_viewer_id: viewer.kind === "guest" ? null : viewer.userId,
          p_box_id: request.boxId ?? null, p_from: fromDate ?? null, p_to: toDate ?? null,
        })
        if (response.error) return unavailable
        const envelope = object(response.data)
        if (envelope?.ok !== true) return failure(response.data)
        const data = parseStats(envelope.data)
        return data ? { ok: true, data } : unavailable
      } catch { return unavailable }
    },
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
