import type { QueryClient } from "@tanstack/react-query"
import type { FriendEntry, RequestEntry, SocialMutationResult } from "./contracts"
import type { BlockEntry } from "./client"
import { invalidationQueryRoot, publicOwnerKey, SOCIAL_QUERY_ROOT } from "./query-keys"

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

/** Apply a mutation's invalidation set. Block also evicts cached public profile details. */
export function applySocialMutation(queryClient: QueryClient, result: SocialMutationResult, targetUserId?: string) {
  for (const kind of result.invalidated) {
    void queryClient.invalidateQueries({ queryKey: invalidationQueryRoot(kind) })
  }
  if (!targetUserId) return
  if (result.invalidated.includes("blocks") && result.invalidated.includes("friends")) {
    queryClient.removeQueries({ queryKey: publicOwnerKey(targetUserId) })
    queryClient.setQueriesData({ queryKey: [SOCIAL_QUERY_ROOT, "friends"] }, (page: FriendPage | undefined) => dropFriend(page, targetUserId))
    queryClient.setQueriesData({ queryKey: [SOCIAL_QUERY_ROOT, "requests"] }, (page: RequestPage | undefined) => dropRequest(page, targetUserId))
  }
}

export function dropUnblockedUser(queryClient: QueryClient, targetUserId: string) {
  queryClient.setQueriesData({ queryKey: [SOCIAL_QUERY_ROOT, "blocks"] }, (page: BlockPage | undefined) => keepBlock(page, targetUserId))
}
