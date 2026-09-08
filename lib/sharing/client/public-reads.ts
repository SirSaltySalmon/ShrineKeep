import type {
  CursorPage,
  OperationError,
  PublicBox,
  PublicBoxStats,
  PublicCollectionItem,
  PublicItemDetail,
  PublicMedia,
  PublicWishlistItem,
} from "../contracts"
import { SHARING_LIMITS } from "../contracts"

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class PublicReadError extends Error {
  readonly error: OperationError
  constructor(error: OperationError) {
    super(error.code)
    this.error = error
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function parseError(status: number, body: unknown): OperationError {
  const error = object(object(body)?.error) ?? object(body)
  const code = typeof error?.code === "string" ? error.code : "temporarily_unavailable"
  if (code === "rate_limited") {
    const retryAfterSeconds = typeof error?.retryAfterSeconds === "number" && Number.isSafeInteger(error.retryAfterSeconds) && error.retryAfterSeconds > 0
      ? error.retryAfterSeconds
      : 1
    return { code: "rate_limited", status: 429, retryAfterSeconds }
  }
  if (code === "cursor_reset" || code === "revision_conflict") return { code, status: 409 }
  if (code === "authentication_required") return { code, status: 401 }
  if (code === "not_found") return { code, status: 404 }
  if (code === "invalid_input") return { code, status: 400 }
  if (status === 404) return { code: "not_found", status: 404 }
  return { code: "temporarily_unavailable", status: 503 }
}

async function publicGet(path: string): Promise<unknown> {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store" })
  const body = await readJson(response)
  if (!response.ok) throw new PublicReadError(parseError(response.status, body))
  return body
}

function nullableText(value: unknown): value is string | null {
  return value === null || typeof value === "string"
}

function nullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value))
}

function parseMedia(value: unknown): PublicMedia | null {
  if (value === null) return null
  const row = object(value)
  if (!row || typeof row.referenceId !== "string" || typeof row.url !== "string") return null
  if (!(row.expiresAt === null || typeof row.expiresAt === "string")) return null
  return { referenceId: row.referenceId, url: row.url, expiresAt: row.expiresAt }
}

function parsePage<T>(body: unknown, parse: (value: unknown) => T | null): CursorPage<T> {
  const data = object(body)
  if (!data || !Array.isArray(data.entries) || typeof data.hasMore !== "boolean" || !(data.nextCursor === null || typeof data.nextCursor === "string")) {
    throw new PublicReadError({ code: "temporarily_unavailable", status: 503 })
  }
  const entries: T[] = []
  for (const value of data.entries) {
    const item = parse(value)
    if (!item) throw new PublicReadError({ code: "temporarily_unavailable", status: 503 })
    entries.push(item)
  }
  return {
    entries: entries.slice(0, SHARING_LIMITS.publicPageSize),
    hasMore: data.hasMore,
    nextCursor: data.hasMore ? data.nextCursor : null,
  }
}

function parseBox(value: unknown): PublicBox | null {
  const row = object(value)
  if (!row || typeof row.id !== "string" || !uuid.test(row.id) || typeof row.name !== "string" || !nullableText(row.description)) return null
  if (!(row.displayParentId === null || (typeof row.displayParentId === "string" && uuid.test(row.displayParentId)))) return null
  if (typeof row.hasVisibleChildren !== "boolean") return null
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    displayParentId: row.displayParentId,
    hasVisibleChildren: row.hasVisibleChildren,
  }
}

function parseCollectionItem(value: unknown): PublicCollectionItem | null {
  const row = object(value)
  if (!row || typeof row.id !== "string" || !uuid.test(row.id) || typeof row.name !== "string" || !nullableText(row.description)) return null
  if (!nullableNumber(row.currentValue) || !nullableNumber(row.acquisitionPrice) || !nullableText(row.acquisitionDate)) return null
  if ("tags" in row) return null
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    thumbnail: parseMedia(row.thumbnail ?? null),
    currentValue: row.currentValue,
    acquisitionPrice: row.acquisitionPrice,
    acquisitionDate: row.acquisitionDate,
  }
}

function parseWishlistItem(value: unknown): PublicWishlistItem | null {
  const row = object(value)
  if (!row || typeof row.id !== "string" || !uuid.test(row.id) || typeof row.name !== "string" || !nullableText(row.description) || !nullableNumber(row.expectedPrice)) return null
  if ("tags" in row) return null
  let visibleTarget: PublicWishlistItem["visibleTarget"] = null
  if (row.visibleTarget !== null && row.visibleTarget !== undefined) {
    const target = object(row.visibleTarget)
    if (!target || typeof target.id !== "string" || !uuid.test(target.id) || typeof target.name !== "string") return null
    visibleTarget = { id: target.id, name: target.name }
  }
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    thumbnail: parseMedia(row.thumbnail ?? null),
    expectedPrice: row.expectedPrice,
    visibleTarget,
  }
}

function parseDetail<T>(body: unknown, parseItem: (value: unknown) => T | null): PublicItemDetail<T> {
  const data = object(body)
  const item = parseItem(data?.item)
  if (!data || !item) throw new PublicReadError({ code: "temporarily_unavailable", status: 503 })
  return { item, photos: parsePage(data.photos, parseMedia) }
}

function parseStats(value: unknown): PublicBoxStats {
  const row = object(value)
  if (!row || typeof row.currentValue !== "number" || typeof row.totalAcquisition !== "number") {
    throw new PublicReadError({ code: "temporarily_unavailable", status: 503 })
  }
  if (row.bucket !== "day" && row.bucket !== "month" && row.bucket !== "year") {
    throw new PublicReadError({ code: "temporarily_unavailable", status: 503 })
  }
  if (!Array.isArray(row.valueHistory) || !Array.isArray(row.acquisitionHistory)) {
    throw new PublicReadError({ code: "temporarily_unavailable", status: 503 })
  }
  const valueHistory = row.valueHistory.map((point) => {
    const rowPoint = object(point)
    if (!rowPoint || typeof rowPoint.date !== "string" || typeof rowPoint.value !== "number") {
      throw new PublicReadError({ code: "temporarily_unavailable", status: 503 })
    }
    return { date: rowPoint.date, value: rowPoint.value }
  })
  const acquisitionHistory = row.acquisitionHistory.map((point) => {
    const rowPoint = object(point)
    if (!rowPoint || typeof rowPoint.date !== "string" || typeof rowPoint.cumulativeAcquisition !== "number") {
      throw new PublicReadError({ code: "temporarily_unavailable", status: 503 })
    }
    return { date: rowPoint.date, cumulativeAcquisition: rowPoint.cumulativeAcquisition }
  })
  return {
    currentValue: row.currentValue,
    totalAcquisition: row.totalAcquisition,
    valueHistory,
    acquisitionHistory,
    bucket: row.bucket,
  }
}

function ownerPath(ownerId: string, suffix: string) {
  return `/api/public/users/${encodeURIComponent(ownerId)}${suffix}`
}

export async function fetchPublicBoxes(ownerId: string, request: { parentId?: string; cursor?: string | null }) {
  const params = new URLSearchParams()
  if (request.parentId) params.set("parentId", request.parentId)
  if (request.cursor) params.set("cursor", request.cursor)
  const suffix = params.size ? `?${params}` : ""
  return parsePage(await publicGet(`${ownerPath(ownerId, "/boxes")}${suffix}`), parseBox)
}

/** Root items 404 when the collection root is not visible. That is an empty showcase, not a missing profile. */
export function emptyRootCollectionPage(error: unknown, boxId?: string | null): CursorPage<PublicCollectionItem> | null {
  if (boxId) return null
  if (error instanceof PublicReadError && error.error.code === "not_found") {
    return { entries: [], nextCursor: null, hasMore: false }
  }
  return null
}

export async function fetchPublicCollectionItems(ownerId: string, request: { boxId?: string; cursor?: string | null }) {
  const params = new URLSearchParams()
  if (request.cursor) params.set("cursor", request.cursor)
  const suffix = params.size ? `?${params}` : ""
  const path = request.boxId
    ? ownerPath(ownerId, `/boxes/${encodeURIComponent(request.boxId)}/items`)
    : ownerPath(ownerId, "/items")
  return parsePage(await publicGet(`${path}${suffix}`), parseCollectionItem)
}

export async function fetchPublicCollectionDetail(ownerId: string, itemId: string, photosCursor?: string) {
  const suffix = photosCursor ? `?photosCursor=${encodeURIComponent(photosCursor)}` : ""
  return parseDetail(await publicGet(`${ownerPath(ownerId, `/items/${encodeURIComponent(itemId)}`)}${suffix}`), parseCollectionItem)
}

export async function fetchPublicWishlist(ownerId: string, cursor?: string | null) {
  const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""
  return parsePage(await publicGet(`${ownerPath(ownerId, "/wishlist")}${suffix}`), parseWishlistItem)
}

export async function fetchPublicWishlistDetail(ownerId: string, itemId: string, photosCursor?: string) {
  const suffix = photosCursor ? `?photosCursor=${encodeURIComponent(photosCursor)}` : ""
  return parseDetail(await publicGet(`${ownerPath(ownerId, `/wishlist/${encodeURIComponent(itemId)}`)}${suffix}`), parseWishlistItem)
}

export async function fetchPublicStats(ownerId: string, request: { boxId?: string; fromDate?: string; toDate?: string }) {
  const params = new URLSearchParams()
  if (request.boxId) params.set("boxId", request.boxId)
  if (request.fromDate) params.set("fromDate", request.fromDate)
  if (request.toDate) params.set("toDate", request.toDate)
  const suffix = params.size ? `?${params}` : ""
  return parseStats(await publicGet(`${ownerPath(ownerId, "/stats")}${suffix}`))
}

export async function fetchPreviewWishlist(cursor?: string | null) {
  const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""
  return parsePage(await publicGet(`/api/wishlist/preview${suffix}`), parseWishlistItem)
}

export function describePublicReadError(error: OperationError): string {
  switch (error.code) {
    case "not_found":
      return "This profile is not available."
    case "authentication_required":
      return "Sign in to continue."
    case "cursor_reset":
      return "This collection changed. Refresh to keep going."
    default:
      return "Something went wrong. Try again."
  }
}

export function publicErrorMessage(error: unknown): string {
  return error instanceof PublicReadError ? describePublicReadError(error.error) : "Something went wrong. Try again."
}
