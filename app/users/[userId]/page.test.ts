import { describe, expect, it, vi } from "vitest"
import PublicProfilePage, { generateMetadata } from "./page"
import PublicProfileClient from "./public-profile-client"

const mocks = vi.hoisted(() => ({ load: vi.fn(), redirect: vi.fn(), notFound: vi.fn() }))
vi.mock("@/lib/sharing/server/http", () => ({ loadPublicProfilePage: mocks.load }))
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }))
vi.mock("./public-profile-client", () => ({ default: (props: unknown) => props }))

const owner = "61000000-0000-4000-8000-000000000001"
const viewer = "61000000-0000-4000-8000-000000000003"
const profile = {
  id: owner,
  nickname: "Ada",
  bio: "Hello",
  avatar: null,
  sharedStyle: null,
  relationship: "none",
}

describe("public profile page", () => {
  it("renders not-found when the profile is unavailable or public reads are off", async () => {
    mocks.notFound.mockImplementation(() => {
      throw new Error("NEXT_HTTP_ERROR_FALLBACK;404")
    })
    mocks.load.mockResolvedValue({ ok: false, reason: "not_found" })
    await expect(PublicProfilePage({ params: Promise.resolve({ userId: owner }) })).rejects.toThrow("404")
    expect(mocks.notFound).toHaveBeenCalled()
    const metadata = await generateMetadata({ params: Promise.resolve({ userId: owner }) })
    expect(metadata.title).toBe("ShrineKeep")
    expect(JSON.stringify(metadata)).not.toContain("Ada")
  })

  it("sends a broken session to login instead of rendering the owner's identity as the viewer", async () => {
    mocks.redirect.mockImplementation((href: string) => {
      throw new Error(href)
    })
    mocks.load.mockResolvedValue({ ok: false, reason: "authentication_required" })
    await expect(PublicProfilePage({ params: Promise.resolve({ userId: owner }) })).rejects.toThrow("/auth/login?next=")
    expect(mocks.redirect).toHaveBeenCalledWith(`/auth/login?next=${encodeURIComponent(`/users/${owner}`)}`)
  })

  it("hydrates the client with the safe profile and the viewer's name", async () => {
    mocks.load.mockResolvedValue({
      ok: true,
      viewer: { kind: "authenticated", userId: viewer },
      profile,
      viewerName: "Friend",
      sandbox: false,
      socialMutationsEnabled: true,
    })
    const page = await PublicProfilePage({ params: Promise.resolve({ userId: owner }) })
    const client = page.props.children
    expect(client.type).toBe(PublicProfileClient)
    expect(client.props.profile).toEqual(profile)
    expect(client.props.viewerName).toBe("Friend")
    expect(client.props.viewer.userId).toBe(viewer)
    expect(JSON.stringify(client.props)).not.toMatch(/email|wishlist_share_token/)
    const metadata = await generateMetadata({ params: Promise.resolve({ userId: owner }) })
    expect(metadata.title).toBe("Ada · ShrineKeep")
  })
})
