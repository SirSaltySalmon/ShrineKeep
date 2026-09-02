import type { AgentCreateItemSuggestion, ApprovedCreatedItem } from "@/lib/webmcp/types"
import { creationDescription } from "./description-context"

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
