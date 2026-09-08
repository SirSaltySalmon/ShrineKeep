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
    expect(src).toContain("applyColorScheme")
    expect(src).toContain("bg-background")
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
