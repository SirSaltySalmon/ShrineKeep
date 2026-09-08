import type { SocialInvalidation } from "./contracts"

/** React Query root for owner-private social lists. */
export const SOCIAL_QUERY_ROOT = "social" as const
/**
 * Public owner cache prefix. W6 must nest profile, boxes, items, wishlist, and stats
 * under this key so a local block can evict every cached detail for that account.
 */
export const PUBLIC_OWNER_QUERY_ROOT = "public" as const

export function socialFriendsKey(query: string, cursor: string | null) {
  return [SOCIAL_QUERY_ROOT, "friends", query, cursor] as const
}

export function socialRequestsKey(direction: "incoming" | "outgoing", cursor: string | null) {
  return [SOCIAL_QUERY_ROOT, "requests", direction, cursor] as const
}

export function socialNotificationsKey(cursor: string | null) {
  return [SOCIAL_QUERY_ROOT, "notifications", cursor] as const
}

export function socialBlocksKey(cursor: string | null) {
  return [SOCIAL_QUERY_ROOT, "blocks", cursor] as const
}

/** W6 profile shell and all descendant public reads for one owner. */
export function publicOwnerKey(ownerId: string) {
  return [PUBLIC_OWNER_QUERY_ROOT, ownerId] as const
}

export function publicProfileKey(ownerId: string) {
  return [PUBLIC_OWNER_QUERY_ROOT, ownerId, "profile"] as const
}

export function invalidationQueryRoot(kind: SocialInvalidation) {
  return [SOCIAL_QUERY_ROOT, kind] as const
}
