import { sharingKeys, type SocialReadScope } from "@/lib/sharing/cache-keys"

/** React Query root for owner-private social lists. Matches `sharingKeys.social`. */
export const SOCIAL_QUERY_ROOT = "social" as const
/** Canonical public-read cache root from `sharingKeys.public`. */
export const SHARING_PUBLIC_QUERY_ROOT = "sharing-public" as const
/**
 * Alternate public owner prefix. W6 may nest profile reads here; block eviction
 * removes both this and `sharing-public` so a cached detail cannot survive.
 */
export const PUBLIC_OWNER_QUERY_ROOT = "public" as const

export function socialFriendsKey(actorId: string, query: string, cursor: string | null) {
  return sharingKeys.social(actorId, {
    surface: "friends",
    query,
    ...(cursor ? { cursor } : {}),
  })
}

export function socialRequestsKey(actorId: string, direction: "incoming" | "outgoing", cursor: string | null) {
  return sharingKeys.social(actorId, {
    surface: "requests",
    direction,
    ...(cursor ? { cursor } : {}),
  })
}

export function socialNotificationsKey(actorId: string, cursor: string | null) {
  return sharingKeys.social(actorId, {
    surface: "notifications",
    ...(cursor ? { cursor } : {}),
  })
}

export function socialBlocksKey(actorId: string, cursor: string | null) {
  return sharingKeys.social(actorId, {
    surface: "blocks",
    ...(cursor ? { cursor } : {}),
  })
}

export function socialActorKey(actorId: string) {
  return [SOCIAL_QUERY_ROOT, actorId] as const
}

export function sharingPublicOwnerKey(ownerId: string) {
  return [SHARING_PUBLIC_QUERY_ROOT, ownerId] as const
}

/** W6 profile shell and descendant public reads for one owner. */
export function publicOwnerKey(ownerId: string) {
  return [PUBLIC_OWNER_QUERY_ROOT, ownerId] as const
}

export function publicProfileKey(ownerId: string) {
  return [PUBLIC_OWNER_QUERY_ROOT, ownerId, "profile"] as const
}

export function isSocialSurface(queryKey: readonly unknown[], surface: SocialReadScope["surface"]) {
  const scope = queryKey[2]
  return Boolean(scope && typeof scope === "object" && !Array.isArray(scope) && (scope as SocialReadScope).surface === surface)
}
