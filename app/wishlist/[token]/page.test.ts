import { describe, expect, it, vi } from "vitest"
import PublicWishlistPage from "./page"
import NotFound from "@/app/not-found"
import PublicWishlistClient from "./public-wishlist-client"

const mocks = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock("@/lib/sharing/server/http", () => ({ loadTokenWishlistPage: mocks.load }))
vi.mock("./public-wishlist-client", () => ({ default: (props: unknown) => props }))

const owner = "61000000-0000-4000-8000-000000000001"
const token = "c4000000-0000-4000-8000-000000000001"
const wish = {
  id: "61000000-0000-4000-8000-000000000005",
  name: "root public wish",
  description: null,
  thumbnail: null,
  expectedPrice: 0,
  visibleTarget: null,
}

describe("token wishlist page", () => {
  it("renders not-found when the in-process read is denied or disabled", async () => {
    mocks.load.mockResolvedValue({ ok: false })
    const page = await PublicWishlistPage({ params: Promise.resolve({ token }) })
    expect(page.type).toBe(NotFound)
    expect(mocks.load).toHaveBeenCalledWith(token)
  })

  it("renders public wishlist items from the canonical projection", async () => {
    mocks.load.mockResolvedValue({
      ok: true,
      viewer: { kind: "guest" },
      page: { entries: [wish], nextCursor: "cursor-1", hasMore: true },
      profile: { id: owner, nickname: "Collector", bio: "", avatar: null, sharedStyle: null, relationship: "none" },
    })
    const page = await PublicWishlistPage({ params: Promise.resolve({ token }) })
    expect(page.type).toBe(PublicWishlistClient)
    expect(page.props.token).toBe(token)
    expect(page.props.ownerId).toBe(owner)
    expect(page.props.nickname).toBe("Collector")
    expect(page.props.items).toEqual([wish])
    expect(page.props.items[0]).not.toHaveProperty("acquisition_price")
    expect(page.props.nextCursor).toBe("cursor-1")
  })
})
