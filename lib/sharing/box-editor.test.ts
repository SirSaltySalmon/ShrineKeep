import { describe, expect, it } from "vitest"
import { PRIVATE_SHARING_DEFAULTS } from "./contracts"
import {
  countDescendantsById,
  normalizeBox,
  parseOwnerSharingSummary,
  sharingSettingsFromBoxRow,
} from "./box-editor"

describe("sharingSettingsFromBoxRow", () => {
  it("maps box columns into editor settings", () => {
    expect(
      sharingSettingsFromBoxRow({
        collection_visibility: "friends",
        wishlist_visibility: "public",
        share_financials: true,
      }),
    ).toEqual({
      collectionVisibility: "friends",
      wishlistVisibility: "public",
      shareFinancials: true,
    })
  })

  it("falls back to private when columns are missing", () => {
    expect(sharingSettingsFromBoxRow({ id: "box" })).toEqual(PRIVATE_SHARING_DEFAULTS)
  })
})

describe("countDescendantsById", () => {
  it("counts the full subtree, not only direct children", () => {
    expect(
      countDescendantsById([
        { id: "root", parent_box_id: null },
        { id: "child", parent_box_id: "root" },
        { id: "grand", parent_box_id: "child" },
      ]),
    ).toEqual({ root: 2, child: 1, grand: 0 })
  })

  it("does not hang on cycles", () => {
    const counts = countDescendantsById([
      { id: "a", parent_box_id: "b" },
      { id: "b", parent_box_id: "a" },
    ])
    expect(counts.a).toBeGreaterThanOrEqual(0)
    expect(counts.b).toBeGreaterThanOrEqual(0)
  })
})

describe("normalizeBox", () => {
  it("attaches sharing and descendant count before the folder is considered loaded", () => {
    const box = normalizeBox(
      {
        id: "child",
        name: "Mecha",
        collection_visibility: "public",
        wishlist_visibility: "private",
        share_financials: false,
      },
      { child: 3 },
    )
    expect(box.sharing).toEqual({
      collectionVisibility: "public",
      wishlistVisibility: "private",
      shareFinancials: false,
    })
    expect(box.descendant_count).toBe(3)
  })
})

describe("parseOwnerSharingSummary", () => {
  const snapshot = {
    revision: "9007199254740993",
    wishlistGuestVisibleCount: 2,
    wishlistGuestTotalCount: 4,
    nickname: "Shown",
    bio: "plain",
    profileShareStyle: false,
    wishlistLinkEnabled: true,
    wishlistShareToken: "share-token-value",
    root: {
      collectionVisibility: "private",
      wishlistVisibility: "public",
      shareFinancials: false,
    },
  }

  it("keeps bigint revisions as strings", () => {
    expect(parseOwnerSharingSummary(snapshot)).toEqual({
      available: true,
      ...snapshot,
    })
  })

  it("rejects incomplete payloads", () => {
    expect(parseOwnerSharingSummary({ revision: "1" })).toBeNull()
    expect(parseOwnerSharingSummary({ ...snapshot, root: { collectionVisibility: "private" } })).toBeNull()
  })
})
