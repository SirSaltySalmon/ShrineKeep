import { describe, expect, it } from "vitest"
import { AUDIENCES, GUEST_VIEWER, PRIVATE_SHARING_DEFAULTS } from "./contracts"
import { isPublicBioValid, isPublicNicknameValid, publicNickname } from "./identity"
import { sharingKeys } from "./cache-keys"
import { chooseCollection, chooseWishlist, openSharingDraft } from "./sharing-draft"
import { READ_ONLY_CAPABILITIES, publishedCapabilities } from "./presentation/capabilities"
import { ACCOUNTS, VIEWER_CASES, expectedAudience, expectedHierarchy, expectedWishlist } from "./testing/privacy-fixtures"

describe("published privacy reference fixtures (not database authorization proof)", () => {
  for (const viewer of VIEWER_CASES) {
    for (const collection of AUDIENCES) {
      for (const wishlist of AUDIENCES) {
        for (const explicitlyPrivate of [false, true]) {
          it(`${viewer}: collection=${collection}, wishlist=${wishlist}, private=${explicitlyPrivate}`, () => {
            const item = { isWishlist: true, explicitlyPrivate, target: { collection, wishlist, shareFinancials: false }, detached: null, root: "private" as const, expectedPrice: 0 }
            const expected = !explicitlyPrivate && viewer !== "blocked" &&
              (wishlist === "public" || (wishlist === "friends" && (viewer === "owner" || viewer === "friend")))
            expect(expectedWishlist(item, viewer)).toBe(expected)
            expect(expectedWishlist({ ...item, target: { ...item.target, shareFinancials: true } }, viewer)).toBe(expected)
            expect(expectedWishlist({ ...item, isWishlist: false }, viewer)).toBe(false)
          })
        }
      }
    }
  }

  it("unpublishable accounts deny every audience, including guests and owners", () => {
    for (const account of [ACCOUNTS.sandbox, ACCOUNTS.inactive, ACCOUNTS.deleting]) {
      for (const viewer of VIEWER_CASES) for (const audience of AUDIENCES) expect(expectedAudience(audience, viewer, account)).toBe(false)
    }
  })

  it("visible boxes keep their real parent; top-level is null", () => {
    expect(expectedHierarchy("guest")).toEqual([{ id: "A", displayParentId: null }])
    expect(expectedHierarchy("friend")).toEqual([{ id: "A", displayParentId: null }, { id: "B", displayParentId: "A" }])
    expect(expectedHierarchy("blocked")).toEqual([])
  })

  it("detached privacy takes precedence over public root defaults", () => {
    const item = { isWishlist: true, explicitlyPrivate: false, target: null, detached: "private" as const, root: "public" as const, expectedPrice: 20 }
    expect(expectedWishlist(item, "guest")).toBe(false)
    expect(expectedWishlist({ ...item, detached: null }, "guest")).toBe(true)
  })
})

describe("identity and presentation contracts", () => {
  it("uses the stored display name or a neutral UUID suffix", () => {
    expect(publicNickname("00000000-0000-4000-8000-0000abcdef12", null)).toBe("Collector-abcdef12")
    expect(publicNickname("id", "  Chosen name  ")).toBe("Chosen name")
    expect(isPublicNicknameValid("😀".repeat(64))).toBe(true)
    expect(isPublicNicknameValid("😀".repeat(65))).toBe(false)
    expect(isPublicBioValid("😀".repeat(500))).toBe(true)
    expect(isPublicBioValid("😀".repeat(501))).toBe(false)
    expect(isPublicBioValid(null)).toBe(false)
  })

  it("public copy affordance cannot enable owner mutations", () => {
    expect(publishedCapabilities(true)).toEqual({
      ...READ_ONLY_CAPABILITIES,
      canCopyToOwnDashboard: true,
      canShowStats: true,
      canOpenDetail: true,
    })
    expect(Object.values(READ_ONLY_CAPABILITIES).every(value => value === false)).toBe(true)
  })

  it("separates owner, public, preview, and different viewer caches", () => {
    const scope = { surface: "wishlist" as const, cursor: "page2", revision: "9007199254740993" }
    const keys = [sharingKeys.owner("owner", scope), sharingKeys.public("owner", GUEST_VIEWER, scope), sharingKeys.preview("owner", scope), sharingKeys.public("owner", { kind: "authenticated", userId: "friend" }, scope), sharingKeys.public("owner", { kind: "authenticated", userId: "stranger" }, scope)]
    expect(new Set(keys.map(key => JSON.stringify(key))).size).toBe(keys.length)
  })

  it("reopening preserves independent choices; manual wishlist choice beats suggestions", () => {
    const saved = { ...PRIVATE_SHARING_DEFAULTS, wishlistVisibility: "public" as const }
    const draft = openSharingDraft(saved)
    expect(draft.wishlistVisibility).toBe("public")
    expect(draft.applyToDescendants).toBe(true)
    expect(chooseCollection(draft, "friends").wishlistVisibility).toBe("friends")
    expect(chooseCollection(chooseWishlist(draft, "private"), "public").wishlistVisibility).toBe("private")
    expect(saved.wishlistVisibility).toBe("public")
  })

  it("keeps incoming and outgoing requests in separate caches", () => {
    expect(sharingKeys.social("owner", { surface: "requests", direction: "incoming" }))
      .not.toEqual(sharingKeys.social("owner", { surface: "requests", direction: "outgoing" }))
  })
})
