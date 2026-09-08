import { QueryClient } from "@tanstack/react-query"
import { describe, expect, it } from "vitest"
import { sharingKeys } from "@/lib/sharing/cache-keys"
import { applySocialMutation } from "./invalidate"
import { publicOwnerKey, publicProfileKey, socialFriendsKey } from "./query-keys"

const actor = "e1000000-0000-4000-8000-000000000001"
const blocked = "e1000000-0000-4000-8000-000000000002"
const other = "e1000000-0000-4000-8000-000000000003"

describe("social query keys", () => {
  it("matches sharingKeys.social so owner-private lists share one cache partition", () => {
    expect(socialFriendsKey(actor, "Ada", null)).toEqual(
      sharingKeys.social(actor, { surface: "friends", query: "Ada" })
    )
    expect(socialFriendsKey(actor, "", "cursor-2")).toEqual(
      sharingKeys.social(actor, { surface: "friends", query: "", cursor: "cursor-2" })
    )
  })
})

describe("applySocialMutation", () => {
  it("evicts sharing-public and placeholder public caches after a local block and drops that friend from the list", () => {
    const queryClient = new QueryClient()
    const publicKey = sharingKeys.public(blocked, { kind: "authenticated", userId: actor }, { surface: "profile" })
    queryClient.setQueryData(publicKey, { id: blocked, nickname: "Ada", bio: "secret", relationship: "friends" })
    queryClient.setQueryData(publicProfileKey(blocked), { id: blocked, nickname: "Ada", bio: "secret", relationship: "friends" })
    queryClient.setQueryData(publicOwnerKey(blocked).concat("wishlist"), { entries: [{ id: "wish-1" }] })
    queryClient.setQueryData(socialFriendsKey(actor, "", null), {
      entries: [
        { profile: { id: blocked, nickname: "Ada", avatar: null }, acceptedAt: "2026-01-01T00:00:00.000Z" },
        { profile: { id: other, nickname: "Bea", avatar: null }, acceptedAt: "2026-01-02T00:00:00.000Z" },
      ],
      hasMore: false,
      nextCursor: null,
    })

    applySocialMutation(
      queryClient,
      { revision: "4", invalidated: ["friends", "requests", "notifications", "blocks"] },
      { actorId: actor, targetUserId: blocked }
    )

    expect(queryClient.getQueryData(publicKey)).toBeUndefined()
    expect(queryClient.getQueryData(publicProfileKey(blocked))).toBeUndefined()
    expect(queryClient.getQueryData(publicOwnerKey(blocked).concat("wishlist"))).toBeUndefined()
    const friends = queryClient.getQueryData(socialFriendsKey(actor, "", null)) as { entries: Array<{ profile: { id: string } }> }
    expect(friends.entries.map((entry) => entry.profile.id)).toEqual([other])
  })

  it("does not evict public profile caches on unfriend", () => {
    const queryClient = new QueryClient()
    const publicKey = sharingKeys.public(blocked, { kind: "guest" }, { surface: "profile" })
    queryClient.setQueryData(publicKey, { id: blocked, nickname: "Ada" })
    queryClient.setQueryData(publicProfileKey(blocked), { id: blocked, nickname: "Ada" })
    applySocialMutation(queryClient, { revision: "5", invalidated: ["friends"] }, { actorId: actor, targetUserId: blocked })
    expect(queryClient.getQueryData(publicKey)).toEqual({ id: blocked, nickname: "Ada" })
    expect(queryClient.getQueryData(publicProfileKey(blocked))).toEqual({ id: blocked, nickname: "Ada" })
  })
})
