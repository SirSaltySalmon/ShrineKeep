import type { CursorPage, OperationError } from "@/lib/sharing/contracts"
import { SHARING_LIMITS } from "@/lib/sharing/contracts"
import type { FriendEntry, RequestEntry, SocialMutationResult, SocialNotification } from "./contracts"
import { SOCIAL_DEFAULTS } from "./contracts"

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type SocialClientError = OperationError

export class SocialRequestError extends Error {
  readonly error: SocialClientError
  constructor(error: SocialClientError) {
    super(error.code)
    this.error = error
  }
}

export type BlockEntry = { userId: string; createdAt: string }
export type NotificationPage = CursorPage<SocialNotification> & { unreadCount: number; unreadCountCapped: boolean }

/** Extract a user UUID from a raw id or a `/users/[userId]` profile link. */
export function parseProfileTarget(input: string): string | null {
  const trimmed = input.trim()
  if (uuid.test(trimmed)) return trimmed.toLowerCase()
  try {
    const url = trimmed.includes("://") ? new URL(trimmed) : new URL(trimmed, "https://shrinekeep.local")
    const parts = url.pathname.split("/").filter(Boolean)
    const usersIndex = parts.findIndex((part) => part === "users")
    const candidate = usersIndex >= 0 ? parts[usersIndex + 1] : null
    return candidate && uuid.test(candidate) ? candidate.toLowerCase() : null
  } catch {
    return null
  }
}

export function boundSocialPage<T>(entries: T[]): T[] {
  return entries.slice(0, SOCIAL_DEFAULTS.pageSize)
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function parseError(_status: number, body: unknown): SocialClientError {
  const error = object(object(body)?.error) ?? object(body)
  const code = typeof error?.code === "string" ? error.code : "temporarily_unavailable"
  if (code === "rate_limited") {
    const retryAfterSeconds = typeof error?.retryAfterSeconds === "number" && Number.isSafeInteger(error.retryAfterSeconds) && error.retryAfterSeconds > 0
      ? error.retryAfterSeconds
      : 1
    return { code: "rate_limited", status: 429, retryAfterSeconds }
  }
  if (code === "stale_request" || code === "idempotency_conflict") return { code, status: 409 }
  if (code === "authentication_required") return { code, status: 401 }
  if (code === "mutation_forbidden") return { code, status: 403 }
  if (code === "not_found") return { code, status: 404 }
  if (code === "invalid_input") return { code, status: 400 }
  if (code === "cursor_reset") return { code, status: 409 }
  return { code: "temporarily_unavailable", status: 503 }
}

async function socialGet(path: string): Promise<unknown> {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store" })
  const body = await readJson(response)
  if (!response.ok) throw new SocialRequestError(parseError(response.status, body))
  return body
}

async function socialWrite(path: string, method: string, body?: Record<string, unknown>): Promise<SocialMutationResult> {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const payload = await readJson(response)
  if (!response.ok) throw new SocialRequestError(parseError(response.status, payload))
  const data = object(payload)
  if (!data || typeof data.revision !== "string" || !Array.isArray(data.invalidated)) {
    throw new SocialRequestError({ code: "temporarily_unavailable", status: 503 })
  }
  return { revision: data.revision, invalidated: data.invalidated as SocialMutationResult["invalidated"] }
}

function parsePage<T>(body: unknown, parse: (value: unknown) => T | null): CursorPage<T> {
  const data = object(body)
  if (!data || !Array.isArray(data.entries) || typeof data.hasMore !== "boolean" || !(data.nextCursor === null || typeof data.nextCursor === "string")) {
    throw new SocialRequestError({ code: "temporarily_unavailable", status: 503 })
  }
  const entries: T[] = []
  for (const value of data.entries) {
    const item = parse(value)
    if (!item) throw new SocialRequestError({ code: "temporarily_unavailable", status: 503 })
    entries.push(item)
  }
  return { entries: boundSocialPage(entries), hasMore: data.hasMore && entries.length >= SOCIAL_DEFAULTS.pageSize, nextCursor: data.hasMore ? data.nextCursor : null }
}

function parseIdentity(value: unknown) {
  const row = object(value)
  if (!row || typeof row.id !== "string" || !uuid.test(row.id) || typeof row.nickname !== "string") return null
  return { id: row.id, nickname: row.nickname, avatar: null as null }
}

function parseFriend(value: unknown): FriendEntry | null {
  const row = object(value)
  const profile = parseIdentity(row?.profile)
  return row && profile && typeof row.acceptedAt === "string" ? { profile, acceptedAt: row.acceptedAt } : null
}

function parseRequest(value: unknown): RequestEntry | null {
  const row = object(value)
  const profile = parseIdentity(row?.profile)
  if (!row || !profile || typeof row.requestId !== "string" || !uuid.test(row.requestId) || typeof row.version !== "string" || typeof row.createdAt !== "string") return null
  if (row.direction !== "incoming" && row.direction !== "outgoing") return null
  return { profile, requestId: row.requestId, version: row.version, createdAt: row.createdAt, direction: row.direction }
}

function parseNotification(value: unknown): SocialNotification | null {
  const row = object(value)
  const actor = parseIdentity(row?.actor)
  if (!row || typeof row.id !== "string" || !uuid.test(row.id) || !actor || (row.kind !== "request" && row.kind !== "acceptance") || typeof row.createdAt !== "string") return null
  if (!(row.readAt === null || typeof row.readAt === "string")) return null
  let actionableRequest: SocialNotification["actionableRequest"] = null
  if (row.actionableRequest !== null && row.actionableRequest !== undefined) {
    const action = object(row.actionableRequest)
    if (!action || typeof action.requestId !== "string" || !uuid.test(action.requestId) || typeof action.version !== "string") return null
    actionableRequest = { requestId: action.requestId, version: action.version }
  }
  return { id: row.id, actor, kind: row.kind, createdAt: row.createdAt, readAt: row.readAt, actionableRequest }
}

function parseBlock(value: unknown): BlockEntry | null {
  const row = object(value)
  if (!row || typeof row.userId !== "string" || !uuid.test(row.userId) || typeof row.createdAt !== "string") return null
  if ("profile" in row || "nickname" in row) return null
  return { userId: row.userId, createdAt: row.createdAt }
}

export function friendsSearchQuery(input: string): string {
  const trimmed = input.trim()
  return Array.from(trimmed).slice(0, SHARING_LIMITS.searchCharacters).join("")
}

export async function fetchFriends(request: { query: string; cursor: string | null }): Promise<CursorPage<FriendEntry>> {
  const params = new URLSearchParams()
  if (request.query) params.set("query", request.query)
  if (request.cursor) params.set("cursor", request.cursor)
  const suffix = params.size ? `?${params.toString()}` : ""
  return parsePage(await socialGet(`/api/social/friends${suffix}`), parseFriend)
}

export async function fetchRequests(request: { direction: "incoming" | "outgoing"; cursor: string | null }): Promise<CursorPage<RequestEntry>> {
  const params = new URLSearchParams({ direction: request.direction })
  if (request.cursor) params.set("cursor", request.cursor)
  return parsePage(await socialGet(`/api/social/requests?${params.toString()}`), parseRequest)
}

export async function fetchNotifications(cursor: string | null): Promise<NotificationPage> {
  const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""
  const body = object(await socialGet(`/api/social/notifications${suffix}`))
  const page = parsePage(body, parseNotification)
  if (!body || typeof body.unreadCount !== "number" || typeof body.unreadCountCapped !== "boolean") {
    throw new SocialRequestError({ code: "temporarily_unavailable", status: 503 })
  }
  return { ...page, unreadCount: body.unreadCount, unreadCountCapped: body.unreadCountCapped }
}

export async function fetchBlocks(cursor: string | null): Promise<CursorPage<BlockEntry>> {
  const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""
  return parsePage(await socialGet(`/api/social/blocks${suffix}`), parseBlock)
}

export async function sendFriendRequest(targetUserId: string, idempotencyKey: string) {
  return socialWrite("/api/social/requests", "POST", { targetUserId, idempotencyKey })
}

/** Accept binds the path and version from the current row or notification. Never substitute a newer request. */
export async function acceptRequest(input: { targetUserId: string; requestId: string; version: string }) {
  return socialWrite(`/api/social/requests/${input.requestId}/accept`, "POST", { targetUserId: input.targetUserId, version: input.version })
}

export async function declineRequest(input: { targetUserId: string; requestId: string; version: string }) {
  return socialWrite(`/api/social/requests/${input.requestId}/decline`, "POST", { targetUserId: input.targetUserId, version: input.version })
}

export async function cancelRequest(input: { targetUserId: string; requestId: string; version: string }) {
  return socialWrite(`/api/social/requests/${input.requestId}`, "DELETE", { targetUserId: input.targetUserId, version: input.version })
}

export async function unfriendUser(targetUserId: string) {
  return socialWrite(`/api/social/friends/${targetUserId}`, "DELETE")
}

export async function blockUser(targetUserId: string) {
  return socialWrite("/api/social/blocks", "POST", { targetUserId })
}

export async function unblockUser(targetUserId: string) {
  return socialWrite(`/api/social/blocks/${targetUserId}`, "DELETE")
}

export async function markNotificationsRead(input: { notificationIds: string[] } | { allVisible: true }) {
  return socialWrite("/api/social/notifications/read", "PATCH", input)
}

export function describeSocialError(error: SocialClientError): string {
  switch (error.code) {
    case "stale_request":
      return "This request is no longer current."
    case "rate_limited":
      return `Too many requests. Try again in ${error.retryAfterSeconds} seconds.`
    case "mutation_forbidden":
      return "This account cannot change friendships."
    case "not_found":
      return "That profile is not available."
    case "invalid_input":
      return "Check the profile link or user ID and try again."
    case "authentication_required":
      return "Sign in to continue."
    default:
      return "Something went wrong. Try again."
  }
}
