import { describe, expect, it } from "vitest"
import { buildApprovedCreatedItems } from "./review"
import type { AgentCreateItemSuggestion } from "./types"

function suggestion(
  overrides: Partial<AgentCreateItemSuggestion> & Pick<AgentCreateItemSuggestion, "key" | "name" | "itemKind">
): AgentCreateItemSuggestion {
  return {
    currentValue: null,
    acquisitionPrice: null,
    expectedPrice: null,
    rationale: "",
    sources: [],
    existingMatch: null,
    ...overrides,
  }
}

describe("buildApprovedCreatedItems", () => {
  it("saves only opted-in, selected descriptions and preserves clearing", () => {
    const drafts = [
      suggestion({ key: "evidence", name: "Item", itemKind: "collection", description: "Reviewed evidence" }),
      suggestion({ key: "clear", name: "Other", itemKind: "wishlist", description: "" }),
      suggestion({ key: "skip", name: "Skipped", itemKind: "wishlist", description: "Do not save" }),
    ]
    const selected = new Set(["evidence", "clear"])
    expect(buildApprovedCreatedItems(drafts, selected, true).map((row) => row.description))
      .toEqual(["Reviewed evidence", null])
    expect(buildApprovedCreatedItems(drafts, selected).every((row) => row.description === undefined)).toBe(true)
  })
  it("preserves reviewed prices and sends only fields valid for the selected status", () => {
    const drafts = [
      suggestion({
        key: "owned",
        name: "  Gundam Aerial  ",
        itemKind: "collection",
        currentValue: 24.5,
        acquisitionPrice: 19.99,
        expectedPrice: 999,
      }),
      suggestion({
        key: "wanted",
        name: "Gundam Calibarn",
        itemKind: "wishlist",
        currentValue: 30,
        acquisitionPrice: 999,
        expectedPrice: 27.95,
      }),
    ]

    expect(buildApprovedCreatedItems(drafts, new Set(["owned", "wanted"]))).toEqual([
      {
        name: "Gundam Aerial",
        item_kind: "collection",
        current_value: 24.5,
        acquisition_price: 19.99,
        expected_price: null,
      },
      {
        name: "Gundam Calibarn",
        item_kind: "wishlist",
        current_value: 30,
        acquisition_price: null,
        expected_price: 27.95,
      },
    ])
  })

  it("omits unselected and blank-name rows", () => {
    const drafts = [
      suggestion({ key: "selected", name: "", itemKind: "wishlist" }),
      suggestion({ key: "unselected", name: "Darilbalde", itemKind: "wishlist" }),
    ]

    expect(buildApprovedCreatedItems(drafts, new Set(["selected"]))).toEqual([])
  })
})
