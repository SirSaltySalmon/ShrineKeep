import { describe, expect, it } from "vitest"
import { PRIVATE_SHARING_DEFAULTS } from "./contracts"
import {
  countDescendantsById,
  laterSharingRevision,
  normalizeBox,
  overlayOwnerSharingSnapshot,
  parseOwnerSharingSummary,
  revisionAfterDirectBoxWrite,
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

describe("laterSharingRevision", () => {
  it("keeps a local write when dashboard props are still stale", () => {
    expect(laterSharingRevision("6", "7")).toBe("7")
    expect(laterSharingRevision("7", "6")).toBe("7")
  })
})

describe("revisionAfterDirectBoxWrite", () => {
  it("accounts for the extra bump from a name/description boxes UPDATE", () => {
    expect(revisionAfterDirectBoxWrite("7")).toBe("8")
    expect(revisionAfterDirectBoxWrite("9007199254740993")).toBe("9007199254740994")
  })
})

describe("overlayOwnerSharingSnapshot", () => {
  const snapshot = {
    available: true as const,
    revision: "6",
    wishlistGuestVisibleCount: 2,
    wishlistGuestTotalCount: 4,
    nickname: "Shown",
    bio: "plain",
    profileShareStyle: false,
    wishlistLinkEnabled: true,
    wishlistShareToken: "share-token-value",
    root: {
      collectionVisibility: "private" as const,
      wishlistVisibility: "public" as const,
      shareFinancials: false,
    },
  }

  it("bumps revision from the PUT even when the follow-up GET cannot be parsed", () => {
    expect(overlayOwnerSharingSnapshot(snapshot, "7", null).revision).toBe("7")
  })

  it("keeps a local root write when the follow-up GET cannot be parsed", () => {
    const nextRoot = {
      collectionVisibility: "friends" as const,
      wishlistVisibility: "public" as const,
      shareFinancials: false,
    }
    expect(overlayOwnerSharingSnapshot(snapshot, "7", null, { root: nextRoot }).root).toEqual(nextRoot)
  })

  it("does not let a stale GET overwrite a newer write revision", () => {
    expect(overlayOwnerSharingSnapshot(snapshot, "8", { ...snapshot, revision: "7" }).revision).toBe("8")
  })

  it("keeps the extra boxes-write bump when the follow-up GET is still on the PUT revision", () => {
    expect(
      overlayOwnerSharingSnapshot(snapshot, revisionAfterDirectBoxWrite("7"), { ...snapshot, revision: "7" }).revision,
    ).toBe("8")
  })
})
