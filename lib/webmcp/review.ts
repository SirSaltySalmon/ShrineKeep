import type {
  AgentCreateItemSuggestion,
  AgentSuggestionBatch,
  ApprovedCreatedItem,
} from "@/lib/webmcp/types"
import { creationDescription } from "./description-context"

export function switchCreateItemKind(
  entry: AgentCreateItemSuggestion,
  itemKind: "collection" | "wishlist"
): AgentCreateItemSuggestion {
  if (entry.itemKind === itemKind) return entry
  if (itemKind === "collection") {
    return { ...entry, itemKind, acquisitionPrice: entry.expectedPrice }
  }
  return { ...entry, itemKind, expectedPrice: entry.acquisitionPrice }
}

export function persistAgentReviewDraft(
  batch: AgentSuggestionBatch,
  draft: {
    selectedKeys: string[]
    imageSearchOverride?: boolean | null
    entries: AgentSuggestionBatch["entries"]
  }
): AgentSuggestionBatch {
  return {
    ...batch,
    selectedKeys: draft.selectedKeys,
    ...(draft.imageSearchOverride !== undefined ? { imageSearchOverride: draft.imageSearchOverride } : {}),
    entries: draft.entries,
  } as AgentSuggestionBatch
}

export function initialSelectedKeys(batch: AgentSuggestionBatch | null): Set<string> {
  if (!batch) return new Set()
  if (batch.selectedKeys !== undefined) return new Set(batch.selectedKeys)
  return new Set(
    batch.entries
      .filter((entry) => !("existingMatch" in entry && entry.existingMatch))
      .map((entry) => entry.key)
  )
}

export function buildApprovedCreatedItems(
  drafts: AgentCreateItemSuggestion[],
  selected: ReadonlySet<string>,
  attachPriceEvidence = false
): ApprovedCreatedItem[] {
  return drafts.flatMap<ApprovedCreatedItem>((entry) => {
    if (!selected.has(entry.key) || !entry.name.trim()) return []

    return [
      {
        name: entry.name.trim(),
        ...(attachPriceEvidence ? { description: creationDescription(entry.description, true) } : {}),
        item_kind: entry.itemKind,
        current_value: entry.currentValue,
        acquisition_price: entry.itemKind === "collection" ? entry.acquisitionPrice : null,
        expected_price: entry.itemKind === "wishlist" ? entry.expectedPrice : null,
      },
    ]
  })
}
