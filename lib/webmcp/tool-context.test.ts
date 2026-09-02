import { describe, expect, it } from "vitest"
import {
  collectionInitializationToolDescription,
  currentBoxItemCreationToolDescription,
  selectedBoxesToolDescription,
  selectedItemsToolDescription,
} from "./tool-context"

describe("WebMCP intent-routing context", () => {
  it("keeps selection reads out of collection creation workflows", () => {
    expect(selectedBoxesToolDescription).toContain("only when the user explicitly refers")
    expect(selectedBoxesToolDescription).toContain("Do not call this for general page context")
    expect(selectedItemsToolDescription("dashboard")).toContain("Do not call this before setting up a new collection")
  })

  it("makes new-box destination and non-prerequisites explicit", () => {
    const description = collectionInitializationToolDescription("Root")
    expect(description).toContain('currently open box "Root"')
    expect(description).toContain("do not call get_selected_boxes or get_selected_items first")
    expect(description).toContain("stage_items_in_current_box instead")
  })

  it("teaches the three approval and pricing paths for both creation tools", () => {
    for (const description of [
      collectionInitializationToolDescription("Root"),
      currentBoxItemCreationToolDescription("Gunpla"),
    ]) {
      expect(description).toContain("Approve list only")
      expect(description).toContain("B: Approve list and research prices for each item")
      expect(description).toContain("C: Approve list, research prices, and attach evidence")
      expect(description).toContain("only for explicit C approval")
      expect(description).toContain("inaccessible, stale, or mismatched")
      expect(description).toContain("A valuation request alone does not authorize description changes")
      expect(description).toContain("expected_price")
      expect(description).toContain("acquisition_price")
    }
  })

  it("requires owned and wishlist reconciliation for current-box completion", () => {
    const description = currentBoxItemCreationToolDescription("Gunpla")
    expect(description).toContain('currently open box "Gunpla"')
    expect(description).toContain("get_current_box_items")
    expect(description).toContain("get_current_box_wishlist_items")
    expect(description).toContain("omit every existing card")
    expect(description).toContain("never creates a child box")
  })

  it("also presents current-box creation as a general-purpose action", () => {
    const description = currentBoxItemCreationToolDescription("Gunpla")
    expect(description).toContain("whether the user names one item, a batch of unrelated items")
    expect(description).toContain("collection research and current-box reads are not prerequisites")
  })
})
