import { describe, expect, it } from "vitest"
import {
  buildApprovedCreatedItems,
  initialSelectedKeys,
  persistAgentReviewDraft,
  switchCreateItemKind,
} from "./review"
import type { AgentCreateItemSuggestion, AgentCreateItemsBatch } from "./types"

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

describe("switchCreateItemKind", () => {
  it("copies expected price into acquisition when moving wishlist to owned", () => {
    const next = switchCreateItemKind(
      suggestion({ key: "card", name: "Aerial", itemKind: "wishlist", expectedPrice: 27.95, currentValue: 30 }),
      "collection"
    )
    expect(next).toMatchObject({ itemKind: "collection", acquisitionPrice: 27.95, currentValue: 30 })
  })

  it("copies acquisition into expected price when moving owned to wishlist", () => {
    const next = switchCreateItemKind(
      suggestion({ key: "card", name: "Aerial", itemKind: "collection", acquisitionPrice: 19.99, currentValue: 24 }),
      "wishlist"
    )
    expect(next).toMatchObject({ itemKind: "wishlist", expectedPrice: 19.99, currentValue: 24 })
  })
})

describe("persistAgentReviewDraft", () => {
  const batch: AgentCreateItemsBatch = {
    id: "stage-1",
    kind: "create_items",
    title: "New box",
    createdAt: "2026-09-03T00:00:00.000Z",
    setSourceUrl: null,
    destination: { kind: "new_box", parentBoxId: null, parentBoxName: "Root", newBoxName: "Witch from Mercury" },
    entries: [
      suggestion({ key: "keep", name: "Aerial", itemKind: "wishlist", expectedPrice: 10, existingMatch: "collection" }),
      suggestion({ key: "drop", name: "Calibarn", itemKind: "wishlist", expectedPrice: 20 }),
    ],
  }

  it("keeps edited values and an empty selection for the next review", () => {
    const edited = [
      { ...batch.entries[0], name: "Gundam Aerial", expectedPrice: 12 },
      { ...batch.entries[1], itemKind: "collection" as const, acquisitionPrice: 20 },
    ]
    const saved = persistAgentReviewDraft(batch, { selectedKeys: [], entries: edited })
    expect(saved.selectedKeys).toEqual([])
    expect(saved.entries[0]).toMatchObject({ name: "Gundam Aerial", expectedPrice: 12 })
    expect(initialSelectedKeys(saved)).toEqual(new Set())
  })

  it("defaults first-open selection to skip existing matches", () => {
    expect([...initialSelectedKeys(batch)]).toEqual(["drop"])
  })
})
