import { createHmac, timingSafeEqual } from "node:crypto"
import type { PublishedViewer, SharingRevision } from "../contracts"

export interface CursorScope {
  ownerId: string
  viewer: PublishedViewer
  viewerCategory: "guest" | "owner" | "friend" | "stranger"
  surface: "friends" | "requests" | "notifications" | "blocks" | "boxes" | "items" | "wishlist" | "photos" | "tags"
  sort: string
  search: string
  /** Canonical serialized allowlisted filters, including parent/item/direction scope. */
  filters: string
  revision: SharingRevision
}

export interface CursorPayload extends CursorScope {
  version: 1
  lastKey: { value: string | number | null; id: string }
}

export type CursorDecodeResult =
  | { ok: true; cursor: CursorPayload }
  | { ok: false; code: "invalid_input" | "cursor_reset" }

const MAX_CURSOR_LENGTH = 4096

function signingKey(secret: string): string {
  if (Buffer.byteLength(secret) < 32) throw new Error("Cursor signing secret must contain at least 32 bytes")
  return secret
}

export function encodeCursor(scope: CursorScope, lastKey: CursorPayload["lastKey"], secret: string): string {
  const body = Buffer.from(JSON.stringify({ ...scope, version: 1, lastKey })).toString("base64url")
  const signature = createHmac("sha256", signingKey(secret)).update(body).digest("base64url")
  const token = `${body}.${signature}`
  if (token.length > MAX_CURSOR_LENGTH) throw new Error("Cursor exceeds maximum length")
  return token
}

/** Integrity/scope validation is not authorization. Reauthorize the query on every page. */
export function decodeCursor(token: string, scope: CursorScope, secret: string): CursorDecodeResult {
  signingKey(secret)
  const invalid = { ok: false, code: "invalid_input" } as const
  if (token.length > MAX_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) return invalid
  const [body, signature] = token.split(".")
  const expected = createHmac("sha256", secret).update(body).digest()
  const actual = Buffer.from(signature, "base64url")
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return invalid
  try {
    const value: unknown = JSON.parse(Buffer.from(body, "base64url").toString("utf8"))
    if (!value || typeof value !== "object") return invalid
    const cursor = value as Partial<CursorPayload>
    if (cursor.version !== 1 || !cursor.viewer || !cursor.lastKey) return invalid
    if (cursor.ownerId !== scope.ownerId || cursor.surface !== scope.surface || cursor.sort !== scope.sort ||
      cursor.search !== scope.search || cursor.filters !== scope.filters || cursor.viewerCategory !== scope.viewerCategory ||
      cursor.viewer.kind !== scope.viewer.kind ||
      (scope.viewer.kind === "authenticated" && (cursor.viewer.kind !== "authenticated" || cursor.viewer.userId !== scope.viewer.userId))) return invalid
    const key = cursor.lastKey
    if (typeof key.id !== "string" || key.id.length === 0 || key.id.length > 128 ||
      !(key.value === null || typeof key.value === "string" || (typeof key.value === "number" && Number.isFinite(key.value)))) return invalid
    if (cursor.revision !== scope.revision) return { ok: false, code: "cursor_reset" }
    return { ok: true, cursor: cursor as CursorPayload }
  } catch {
    return invalid
  }
}
