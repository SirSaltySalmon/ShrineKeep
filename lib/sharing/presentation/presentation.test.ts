import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { COPY_JOB_STATES } from "../contracts"
import {
  OWNER_CAPABILITIES,
  READ_ONLY_CAPABILITIES,
  assertPublicCapabilities,
  hasOwnerMutation,
  publishedCapabilities,
} from "./capabilities"

describe("presentation capabilities", () => {
  it("owner dashboard keeps mutation affordances", () => {
    expect(hasOwnerMutation(OWNER_CAPABILITIES)).toBe(true)
    expect(OWNER_CAPABILITIES.showTags).toBe(true)
    expect(OWNER_CAPABILITIES.canDrag).toBe(true)
  })

  it("public copy cannot re-enable owner mutations or tags", () => {
    const published = publishedCapabilities(true)
    expect(published.canCopyToOwnDashboard).toBe(true)
    expect(published.showTags).toBe(false)
    expect(hasOwnerMutation(published)).toBe(false)
    expect(() => assertPublicCapabilities(published)).not.toThrow()
    expect(() => assertPublicCapabilities(OWNER_CAPABILITIES)).toThrow(/owner mutations/)
  })

  it("read-only token capabilities stay fully off", () => {
    expect(Object.values(READ_ONLY_CAPABILITIES).every(value => value === false)).toBe(true)
  })
})

describe("owner containers still own their chrome", () => {
  it("ItemGrid still mounts the editor only when canEdit", () => {
    const src = readFileSync(fileURLToPath(new URL("../../../components/item-grid.tsx", import.meta.url)), "utf8")
    expect(src).toContain("{!loading && resolvedCapabilities.canEdit && (")
    expect(src).toContain("<ItemDialog")
    expect(src).toContain("presentOwnerItem")
  })

  it("public token wishlist renders through ItemCard without owner hooks", () => {
    const src = readFileSync(fileURLToPath(new URL("../../../app/wishlist/[token]/public-wishlist-client.tsx", import.meta.url)), "utf8")
    expect(src).toContain("presentPublicWishlistItem")
    expect(src).toContain("READ_ONLY_CAPABILITIES")
    expect(src).not.toMatch(/useCopiedItem|ItemDialog|use-webmcp|agent-staging|useSubscription/)
    expect(src).not.toMatch(/document\.documentElement/)
    expect(src).toContain("PublicTheme")
    expect(src).toContain("bg-background")
    expect(src).toContain("/users/${ownerId}")
  })

  it("public profile UI reuses cards/stats and never mounts owner editors or copy", () => {
    const files = [
      "../../../app/users/[userId]/public-profile-client.tsx",
      "../../../components/public-profile/showcase-tab.tsx",
      "../../../components/public-profile/wishlist-tab.tsx",
      "../../../components/public-profile/public-theme.tsx",
      "../../../components/public-profile/box-stats-dialog.tsx",
      "../../../components/public-profile/public-nav.tsx",
    ].map((relative) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8"))
    const src = files.join("\n")
    expect(src).toContain("presentPublicBox")
    expect(src).toContain("presentPublicCollectionItem")
    expect(src).toContain("presentPublicWishlistItem")
    expect(src).toContain("BoxStatsPresentation")
    expect(src).toContain("publishedCapabilities(false)")
    expect(src).toContain("PUBLIC_EMPTY_COPY")
    expect(src).toContain("sharingKeys.public")
    expect(src).toContain("surface: \"wishlist\"")
    expect(src).toContain("surface: \"boxes\"")
    expect(src).not.toMatch(/useCopiedItem|ItemDialog|use-webmcp|agent-staging|useSubscription|Copy to own dashboard/)
    expect(src).not.toMatch(/not public|unpublished|collection is private/)
    expect(src).not.toMatch(/document\.documentElement|applyPublicWishlistColors/)
    expect(src).toContain("publicStyleProperties")
    expect(src).toContain("emptyRootCollectionPage")
  })

  it("item and box cards use theme tokens and touch-safe hover, not hex palettes", () => {
    const itemCard = readFileSync(fileURLToPath(new URL("../../../components/item-card.tsx", import.meta.url)), "utf8")
    const boxCard = readFileSync(fileURLToPath(new URL("../../../components/box-card.tsx", import.meta.url)), "utf8")
    expect(itemCard).toContain("hsl(var(--value-color))")
    expect(itemCard).toContain("CARD_HOVER_MOTION_CLASS")
    expect(itemCard).toContain("cursor-default")
    expect(itemCard).not.toMatch(/bg-green-|text-blue-|#1a1f2e/)
    expect(boxCard).toContain("canRename")
    expect(boxCard).toContain("CARD_HOVER_MOTION_CLASS")
    expect(boxCard).not.toMatch(/bg-green-|text-blue-|#1a1f2e/)
  })

  it("box card keyboard path stays on the shared Selectable control", () => {
    const selectable = readFileSync(fileURLToPath(new URL("../../../components/selectable.tsx", import.meta.url)), "utf8")
    expect(selectable).toContain("touch-manipulation")
    expect(selectable).toContain("tabIndex={-1}")
    expect(selectable).toContain("onFocus")
  })
})

describe("copy job contract freeze", () => {
  it("CopyJobState matches the media lifecycle check constraint", () => {
    expect(COPY_JOB_STATES).toEqual([
      "queued", "planning", "copying", "finalizing", "completed", "failed", "cancelled",
    ])
  })
})
