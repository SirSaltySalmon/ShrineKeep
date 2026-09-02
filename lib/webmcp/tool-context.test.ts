import { describe, expect, it } from "vitest"
import {
  collectionInitializationToolDescription,
  currentBoxItemCreationToolDescription,
  currentBoxItemsToolDescription,
  itemEditsToolDescription,
  selectedItemsToolDescription,
  wishlistContextToolDescription,
  wishlistEditsToolDescription,
} from "./tool-context"

describe("WebMCP intent-routing context", () => {
  it("makes new-box destination explicit", () => {
    const description = collectionInitializationToolDescription("Root")
    expect(description).toContain('currently open box "Root"')
    expect(description).toContain("Research and show the matched set in chat before approval")
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
      expect(description).toContain("expected_price")
      expect(description).toContain("acquisition_price")
      expect(description).not.toContain("A valuation request does not authorize description changes")
    }
  })

  it("requires owned and wishlist reconciliation for current-box completion", () => {
    const description = currentBoxItemCreationToolDescription("Gunpla")
    expect(description).toContain('currently open box "Gunpla"')
    expect(description).toContain("get_current_box_items")
    expect(description).toContain("get_current_box_wishlist_items")
    expect(description).toContain("omit every existing card")
    expect(description).not.toContain("never creates a child box")
  })

  it("also presents current-box creation as a general-purpose action", () => {
    const description = currentBoxItemCreationToolDescription("Gunpla")
    expect(description).toContain("whether the user names one item, a batch")
    expect(description).toContain("For ordinary additions, use the requested products")
  })

  it("keeps remaining tool copy in this module", () => {
    expect(selectedItemsToolDescription("dashboard")).toContain("selected cards")
    expect(currentBoxItemsToolDescription("Root")).toContain('open box "Root"')
    expect(itemEditsToolDescription()).toContain("acquisition_price")
    expect(itemEditsToolDescription()).not.toContain("tag-set")
    expect(wishlistEditsToolDescription("dashboard")).not.toContain("tag-set")
    expect(itemEditsToolDescription()).not.toContain("get_current_box_items")
    expect(wishlistContextToolDescription("wishlist", "Root")).toContain("associated box names")
    expect(wishlistContextToolDescription("dashboard", "Gunpla")).toContain('open box "Gunpla"')
    expect(wishlistEditsToolDescription("wishlist")).toContain("associated box name")
    expect(wishlistEditsToolDescription("dashboard")).toContain("open box")
    expect(wishlistEditsToolDescription("dashboard")).not.toContain("get_current_box_wishlist_items")
  })

  it("does not lock appraisal methodology", () => {
    expect(itemEditsToolDescription()).not.toContain("second-hand")
    expect(wishlistEditsToolDescription("dashboard")).not.toContain("retail")
    expect(currentBoxItemsToolDescription("Root")).not.toContain("include_descendants")
  })

  it("requires an approved approach for every requested price field before research", () => {
    for (const description of [
      collectionInitializationToolDescription("Root"),
      currentBoxItemCreationToolDescription("Gunpla"),
      itemEditsToolDescription(),
      wishlistEditsToolDescription("dashboard"),
    ]) {
      expect(description).toContain("suggest suitable approaches")
      expect(description).toContain("Do not start researching until the user has approved an approach for every requested field")
    }
  })
})
