import { QueryClient } from "@tanstack/react-query"
import { describe, expect, it } from "vitest"
import { applySocialMutation } from "./invalidate"
import { publicOwnerKey, publicProfileKey, socialFriendsKey } from "./query-keys"

const blocked = "e1000000-0000-4000-8000-000000000002"
const other = "e1000000-0000-4000-8000-000000000003"

describe("applySocialMutation", () => {
  it("evicts a cached public profile after a local block and drops that friend from the list cache", () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(publicProfileKey(blocked), { id: blocked, nickname: "Ada", bio: "secret", relationship: "friends" })
    queryClient.setQueryData(publicOwnerKey(blocked).concat("wishlist"), { entries: [{ id: "wish-1" }] })
    queryClient.setQueryData(socialFriendsKey("", null), {
      entries: [
        { profile: { id: blocked, nickname: "Ada", avatar: null }, acceptedAt: "2026-01-01T00:00:00.000Z" },
        { profile: { id: other, nickname: "Bea", avatar: null }, acceptedAt: "2026-01-02T00:00:00.000Z" },
      ],
      hasMore: false,
      nextCursor: null,
    })

    applySocialMutation(queryClient, {
      revision: "4",
      invalidated: ["friends", "requests", "notifications", "blocks"],
    }, blocked)

    expect(queryClient.getQueryData(publicProfileKey(blocked))).toBeUndefined()
    expect(queryClient.getQueryData(publicOwnerKey(blocked).concat("wishlist"))).toBeUndefined()
    const friends = queryClient.getQueryData(socialFriendsKey("", null)) as { entries: Array<{ profile: { id: string } }> }
    expect(friends.entries.map((entry) => entry.profile.id)).toEqual([other])
  })

  it("does not evict public profile caches on unfriend", () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(publicProfileKey(blocked), { id: blocked, nickname: "Ada" })
    applySocialMutation(queryClient, { revision: "5", invalidated: ["friends"] }, blocked)
    expect(queryClient.getQueryData(publicProfileKey(blocked))).toEqual({ id: blocked, nickname: "Ada" })
  })
})
