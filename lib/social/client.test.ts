import { afterEach, describe, expect, it, vi } from "vitest"
import {
  acceptRequest,
  boundSocialPage,
  fetchFriends,
  friendsSearchQuery,
  parseProfileTarget,
  SocialRequestError,
} from "./client"

const target = "e1000000-0000-4000-8000-000000000002"
const staleId = "e2000000-0000-4000-8000-000000000001"
const newerId = "e2000000-0000-4000-8000-000000000099"

describe("parseProfileTarget", () => {
  it("accepts a raw UUID and a /users/[userId] link", () => {
    expect(parseProfileTarget(`  ${target.toUpperCase()}  `)).toBe(target)
    expect(parseProfileTarget(`/users/${target}`)).toBe(target)
    expect(parseProfileTarget(`https://www.shrinekeep.com/users/${target}/wishlist`)).toBe(target)
    expect(parseProfileTarget("not-a-user")).toBeNull()
    expect(parseProfileTarget("/dashboard")).toBeNull()
  })
})

describe("friends search paging", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("sends the search on the first request and never walks extra pages to fill the list", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      expect(url).toContain("/api/social/friends?query=RemoteAlpha")
      expect(url).not.toContain("cursor=")
      return Response.json({
        entries: Array.from({ length: 20 }, (_, index) => ({
          profile: { id: `e1000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, nickname: `RemoteAlpha ${index}`, avatar: null },
          acceptedAt: "2026-01-01T00:00:00.000Z",
        })),
        hasMore: true,
        nextCursor: "cursor-2",
      })
    })
    vi.stubGlobal("fetch", fetchMock)
    const page = await fetchFriends({ query: "RemoteAlpha", cursor: null })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(page.entries).toHaveLength(20)
    expect(page.hasMore).toBe(true)
  })

  it("caps rendered rows even if a response over-fetches", async () => {
    expect(boundSocialPage(Array.from({ length: 200 }, (_, index) => index))).toHaveLength(20)
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      entries: Array.from({ length: 21 }, (_, index) => ({
        profile: { id: `e1000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, nickname: `N${index}`, avatar: null },
        acceptedAt: "2026-01-01T00:00:00.000Z",
      })),
      hasMore: true,
      nextCursor: "cursor-2",
    })))
    const page = await fetchFriends({ query: "", cursor: null })
    expect(page.entries).toHaveLength(20)
  })

  it("truncates search to the server character bound", () => {
    expect(friendsSearchQuery("x".repeat(80)).length).toBe(64)
  })
})

describe("stale request binding", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("accepts only the requestId carried on the current notification, not a newer pair request", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(`/api/social/requests/${staleId}/accept`)
      expect(String(input)).not.toContain(newerId)
      return Response.json({ success: true, revision: "2", invalidated: ["friends", "requests", "notifications"] })
    })
    vi.stubGlobal("fetch", fetchMock)
    const notification = { actionableRequest: { requestId: staleId, version: "1" }, newerRequestId: newerId }
    await acceptRequest({ targetUserId: target, requestId: notification.actionableRequest.requestId, version: notification.actionableRequest.version })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("surfaces stale_request instead of retrying a different id", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { code: "stale_request", status: 409 } }, { status: 409 })))
    await expect(acceptRequest({ targetUserId: target, requestId: staleId, version: "1" })).rejects.toMatchObject({
      error: { code: "stale_request", status: 409 },
    })
    expect.assertions(1)
  })
})

describe("SocialRequestError", () => {
  it("exists for callers that need the structured code", () => {
    expect(new SocialRequestError({ code: "not_found", status: 404 }).error.code).toBe("not_found")
  })
})
