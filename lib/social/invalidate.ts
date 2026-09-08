import type { QueryClient } from "@tanstack/react-query"
import type { FriendEntry, RequestEntry, SocialMutationResult } from "./contracts"
import type { BlockEntry } from "./client"
import {
  isSocialSurface,
  publicOwnerKey,
  sharingPublicOwnerKey,
  socialActorKey,
} from "./query-keys"

type FriendPage = { entries: FriendEntry[] }
type RequestPage = { entries: RequestEntry[] }
type BlockPage = { entries: BlockEntry[] }

function dropFriend(page: FriendPage | undefined, ownerId: string): FriendPage | undefined {
  if (!page) return page
  return { ...page, entries: page.entries.filter((entry) => entry.profile.id !== ownerId) }
}

function dropRequest(page: RequestPage | undefined, ownerId: string): RequestPage | undefined {
  if (!page) return page
  return { ...page, entries: page.entries.filter((entry) => entry.profile.id !== ownerId) }
}

function keepBlock(page: BlockPage | undefined, ownerId: string): BlockPage | undefined {
  if (!page) return page
  return { ...page, entries: page.entries.filter((entry) => entry.userId !== ownerId) }
}

export function evictBlockedOwner(queryClient: QueryClient, ownerId: string) {
  queryClient.removeQueries({ queryKey: sharingPublicOwnerKey(ownerId) })
  queryClient.removeQueries({ queryKey: publicOwnerKey(ownerId) })
}

/** Apply a mutation's invalidation set. Block also evicts cached public profile details. */
export function applySocialMutation(
  queryClient: QueryClient,
  result: SocialMutationResult,
  options: { actorId: string; targetUserId?: string }
) {
  const { actorId, targetUserId } = options
  void queryClient.invalidateQueries({ queryKey: socialActorKey(actorId) })
  if (!targetUserId) return
  if (result.invalidated.includes("blocks") && result.invalidated.includes("friends")) {
    evictBlockedOwner(queryClient, targetUserId)
    queryClient.setQueriesData(
      { queryKey: socialActorKey(actorId), predicate: (query) => isSocialSurface(query.queryKey, "friends") },
      (page: FriendPage | undefined) => dropFriend(page, targetUserId)
    )
    queryClient.setQueriesData(
      { queryKey: socialActorKey(actorId), predicate: (query) => isSocialSurface(query.queryKey, "requests") },
      (page: RequestPage | undefined) => dropRequest(page, targetUserId)
    )
  }
}

export function dropUnblockedUser(queryClient: QueryClient, actorId: string, targetUserId: string) {
  queryClient.setQueriesData(
    { queryKey: socialActorKey(actorId), predicate: (query) => isSocialSurface(query.queryKey, "blocks") },
    (page: BlockPage | undefined) => keepBlock(page, targetUserId)
  )
}
