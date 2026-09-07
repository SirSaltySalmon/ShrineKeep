import type { CursorPage, OperationError, OperationResult, PublicIdentity } from "@/lib/sharing/contracts"
import { SHARING_LIMITS } from "@/lib/sharing/contracts"
import { decodeCursor, encodeCursor, type CursorScope } from "@/lib/sharing/server/cursor"
import type { SharingRpc } from "@/lib/sharing/server/read-core"
import type { FriendEntry, RequestEntry, SocialNotification } from "../contracts"
import { SOCIAL_DEFAULTS } from "../contracts"

type Surface = "friends" | "requests" | "notifications" | "blocks"
type Direction = "incoming" | "outgoing"
type BlockEntry = { userId: string; createdAt: string }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const unavailable: OperationResult<never> = { ok: false, error: { code: "temporarily_unavailable", status: 503 } }
const invalid: OperationResult<never> = { ok: false, error: { code: "invalid_input", status: 400 } }

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
}
function identity(value: unknown): value is string { return typeof value === "string" && uuid.test(value) }
function timestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 40 && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))
}
function version(value: unknown): value is string {
  return typeof value === "string" && /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= BigInt("9223372036854775807")
}
function revision(value: unknown): value is string {
  return typeof value === "string" && /^\d{1,19}$/.test(value) && BigInt(value) <= BigInt("9223372036854775807")
}
function validKey(key: Record<string, unknown>): boolean { return identity(key.id) && timestamp(key.value) }

function parseIdentity(value: unknown): PublicIdentity | null {
  const row = object(value)
  if (!row || !identity(row.id) || typeof row.nickname !== "string" || row.avatar !== null) return null
  return { id: row.id, nickname: row.nickname, avatar: null }
}
function parseFriend(value: unknown): FriendEntry | null {
  const row = object(value)
  const profile = parseIdentity(row?.profile)
  return row && profile && timestamp(row.acceptedAt) ? { profile, acceptedAt: row.acceptedAt } : null
}
function parseRequest(value: unknown, direction: Direction): RequestEntry | null {
  const row = object(value)
  const profile = parseIdentity(row?.profile)
  if (!row || !profile || !identity(row.requestId) || !version(row.version) || !timestamp(row.createdAt) || row.direction !== direction) return null
  return { profile, requestId: row.requestId, version: row.version, createdAt: row.createdAt, direction }
}
function parseNotification(value: unknown): SocialNotification | null {
  const row = object(value)
  const actor = parseIdentity(row?.actor)
  if (!row || !identity(row.id) || !actor || (row.kind !== "request" && row.kind !== "acceptance") || !timestamp(row.createdAt) ||
    !(row.readAt === null || timestamp(row.readAt))) return null
  let actionableRequest: SocialNotification["actionableRequest"] = null
  if (row.actionableRequest !== null) {
    const action = object(row.actionableRequest)
    if (!action || !identity(action.requestId) || !version(action.version)) return null
    actionableRequest = { requestId: action.requestId, version: action.version }
  }
  return { id: row.id, actor, kind: row.kind, createdAt: row.createdAt, readAt: row.readAt, actionableRequest }
}
function parseBlock(value: unknown): BlockEntry | null {
  const row = object(value)
  return row && identity(row.userId) && timestamp(row.createdAt) && !("profile" in row) && !("nickname" in row) ? { userId: row.userId, createdAt: row.createdAt } : null
}

function failure(value: unknown): OperationResult<never> {
  const error = object(object(value)?.error)
  const codes = { invalid_input: 400, authentication_required: 401, not_found: 404, cursor_reset: 409 } as const
  if (error && typeof error.code === "string" && Object.prototype.hasOwnProperty.call(codes, error.code)) {
    const code = error.code as keyof typeof codes
    return { ok: false, error: { code, status: codes[code] } as OperationError }
  }
  return unavailable
}

function normalizeSearch(value: string | undefined): string | null {
  if (value === undefined) return ""
  const trimmed = value.trim()
  return Array.from(trimmed).length <= SHARING_LIMITS.searchCharacters ? trimmed : null
}

export function createSocialReadCore(rpc: SharingRpc, cursorSecret: string) {
  async function page<T>(actorId: string, surface: Surface, direction: Direction | undefined, query: string, cursor: string | undefined, parse: (value: unknown) => T | null): Promise<OperationResult<CursorPage<T> & { unreadCount?: number; unreadCountCapped?: boolean }>> {
    try {
      if (!identity(actorId)) return invalid
      const context = await rpc("social_read_page", { p_actor_id: actorId, p_surface: surface, p_direction: direction ?? null, p_query: query || null, p_after_key: null, p_expected_revision: null })
      if (context.error) return unavailable
      const first = object(context.data)
      if (first?.ok !== true) return failure(context.data)
      const head = object(first.data)
      if (!head || !revision(head.revision) || head.viewerCategory !== "owner") return unavailable
      const scope: CursorScope = {
        ownerId: actorId, viewer: { kind: "authenticated", userId: actorId }, viewerCategory: "owner", surface,
        sort: surface === "friends" ? "accepted_at,id:desc" : "created_at,id:desc", search: query,
        filters: JSON.stringify(direction ? { direction } : {}), revision: head.revision,
      }
      let afterKey: { value: string | number | null; id: string } | null = null
      if (cursor !== undefined) {
        const decoded = decodeCursor(cursor, scope, cursorSecret)
        if (!decoded.ok) return decoded.code === "cursor_reset" ? { ok: false, error: { code: "cursor_reset", status: 409 } } : invalid
        afterKey = decoded.cursor.lastKey
        if (!validKey(afterKey as Record<string, unknown>)) return invalid
      }
      const response = cursor === undefined ? context : await rpc("social_read_page", {
        p_actor_id: actorId, p_surface: surface, p_direction: direction ?? null, p_query: query || null,
        p_after_key: afterKey, p_expected_revision: head.revision,
      })
      if (response.error) return unavailable
      const envelope = object(response.data)
      if (envelope?.ok !== true) return failure(response.data)
      const data = object(envelope.data)
      if (!data || data.revision !== scope.revision || data.viewerCategory !== "owner" || !Array.isArray(data.rows) || data.rows.length > 21) return unavailable
      if (surface === "notifications") {
        if (typeof data.unreadCount !== "number" || !Number.isInteger(data.unreadCount) || data.unreadCount < 0 || data.unreadCount > SOCIAL_DEFAULTS.unreadCountCap ||
          typeof data.unreadCountCapped !== "boolean") return unavailable
      } else if ("unreadCount" in data || "unreadCountCapped" in data) return unavailable
      const rows: Array<{ item: T; key: { value: string; id: string } }> = []
      for (const value of data.rows) {
        const row = object(value)
        const item = parse(row?.item)
        const key = object(row?.key)
        if (!item || !key || !validKey(key)) return unavailable
        const itemId = surface === "friends" ? object(object(row?.item)?.profile)?.id : surface === "requests" ? object(row?.item)?.requestId
          : surface === "blocks" ? object(row?.item)?.userId : object(row?.item)?.id
        if (itemId !== key.id) return unavailable
        rows.push({ item, key: { value: key.value as string, id: key.id as string } })
      }
      const entries = rows.slice(0, 20).map(row => row.item)
      const hasMore = rows.length > 20
      const page = { entries, hasMore, nextCursor: hasMore ? encodeCursor(scope, rows[19].key, cursorSecret) : null }
      return surface === "notifications"
        ? { ok: true, data: { ...page, unreadCount: data.unreadCount as number, unreadCountCapped: data.unreadCountCapped as boolean } }
        : { ok: true, data: page }
    } catch { return unavailable }
  }

  return {
    friends(actorId: string, request: { query?: string; cursor?: string }) {
      const query = normalizeSearch(request.query)
      return query === null ? Promise.resolve(invalid) : page(actorId, "friends", undefined, query, request.cursor, parseFriend)
    },
    requests(actorId: string, request: { direction: Direction; cursor?: string }) {
      return request.direction === "incoming" || request.direction === "outgoing"
        ? page(actorId, "requests", request.direction, "", request.cursor, value => parseRequest(value, request.direction))
        : Promise.resolve(invalid)
    },
    notifications(actorId: string, request: { cursor?: string }) {
      return page(actorId, "notifications", undefined, "", request.cursor, parseNotification)
    },
    blocks(actorId: string, request: { cursor?: string }) {
      return page(actorId, "blocks", undefined, "", request.cursor, parseBlock)
    },
  }
}
