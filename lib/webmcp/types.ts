export interface AgentSuggestionSource {
  url: string
  label?: string
}

export interface AgentItemEditSuggestion {
  key: string
  itemId: string
  itemName: string
  beforeUpdatedAt: string
  beforeCurrentValue: number | null
  beforeAcquisitionPrice: number | null
  beforeDescription: string | null
  proposedName?: string
  proposedDescription?: string | null
  proposedCurrentValue?: number
  proposedAcquisitionPrice?: number
  rationale: string
  sources: AgentSuggestionSource[]
}

export interface AgentCreateItemSuggestion {
  description?: string | null
  key: string
  name: string
  itemKind: "collection" | "wishlist"
  currentValue: number | null
  acquisitionPrice: number | null
  expectedPrice: number | null
  rationale: string
  sources: AgentSuggestionSource[]
  existingMatch: "collection" | "wishlist" | null
}

export interface AgentWishlistPriceSuggestion {
  key: string
  itemId: string
  itemName: string
  boxName: string
  beforeUpdatedAt: string
  beforeExpectedPrice: number | null
  beforeCurrentValue: number | null
  beforeDescription: string | null
  proposedName?: string
  proposedDescription?: string | null
  proposedExpectedPrice?: number
  proposedCurrentValue?: number
  rationale: string
  sources: AgentSuggestionSource[]
}

interface AgentSuggestionBatchBase {
  id: string
  title: string
  createdAt: string
  selectedKeys?: string[]
  imageSearchOverride?: boolean | null
}

export interface AgentItemEditBatch extends AgentSuggestionBatchBase {
  kind: "item_edits"
  scopeName: string
  entries: AgentItemEditSuggestion[]
}

export interface AgentCreateItemsBatch extends AgentSuggestionBatchBase {
  attachPriceEvidence?: boolean
  kind: "create_items"
  setSourceUrl: string | null
  destination:
    | {
        kind: "new_box"
        parentBoxId: string | null
        parentBoxName: string
        newBoxName: string
      }
    | {
        kind: "current_box"
        boxId: string | null
        boxName: string
      }
  entries: AgentCreateItemSuggestion[]
}

export interface AgentWishlistPriceBatch extends AgentSuggestionBatchBase {
  kind: "wishlist_price_edits"
  scopeName: string
  entries: AgentWishlistPriceSuggestion[]
}

export type AgentSuggestionBatch =
  | AgentItemEditBatch
  | AgentCreateItemsBatch
  | AgentWishlistPriceBatch

export interface ApprovedItemEdit {
  id: string
  expected_updated_at: string
  name?: string
  description?: string | null
  current_value?: number
  acquisition_price?: number
}

export interface ApprovedCreatedItem {
  description?: string | null
  name: string
  item_kind: "collection" | "wishlist"
  current_value?: number | null
  acquisition_price?: number | null
  expected_price?: number | null
  photos?: Array<{
    url: string
    is_thumbnail: boolean
  }>
}

export interface ApprovedWishlistPriceEdit {
  id: string
  expected_updated_at: string
  name?: string
  description?: string | null
  expected_price?: number
  current_value?: number
}
