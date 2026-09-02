function quotedScope(scopeName: string) {
  return JSON.stringify(scopeName || "Root")
}

export const pricingResearchGuidance = "Use descriptions to identify the exact item and variant; visit relevant links first. Use linked prices only when the source is reputable, current, and appropriate to the price field. If a link is inaccessible, stale, or mismatched, use verified item details to guide further research. A valuation request alone does not authorize description changes; preserve personal notes."

export const descriptionReadGuidance = "Descriptions default to 300-character previews with description_truncated and complete description_urls. Request include_full_description when more identity context is needed or before proposing description changes."

export const creationNameGuidance = "Name each owned or wishlist item so it immediately identifies the exact product on its own. Automatic thumbnail searches use the name, so include a short verified brand, maker, product line, or variant identifier when needed; do not rely on the box name or description. For example, use 'YouTooz Astarion vinyl figure' instead of 'Astarion vinyl figure'. Keep names concise and never invent identifiers."

export const creationDescriptionGuidance = "Keep the item-focused description to 100 characters or fewer, excluding requested links. If links are requested, including option C, append each URL as plain text on its own line, without labels or Markdown. Do not include prices, price bases, timestamps, research notes, or other irrelevant information in the description; use the dedicated price, rationale, and source_urls fields for research evidence."

export const creationApprovalGuidance = `Before staging a proposed list, offer A: Approve list only; B: Approve list and research prices for each item; C: Approve list, research prices, and attach evidence links to description. C is recommended for more reliable future valuations. When you request valuation, the agent will use links and information in your item descriptions. A bare yes approves the list only unless prices were already requested. Set attach_price_evidence=true only for explicit C approval or an equivalent request; A/B leave descriptions blank. ${creationDescriptionGuidance} Omit unsupported details and never invent missing prices.`

const creationPricingGuidance = "If prices are requested, research every proposed card before the single staging call: wishlist expected_price uses reputable current USD retail price or a reputable secondhand fallback when unavailable/out of production; owned acquisition_price may be an editable estimate of likely original retail or historical market price, and current_value uses typical recent secondhand sold price when valuation is requested. Shipping is excluded; all price fields are USD. Include concise price-basis rationales and source URLs."

export const selectedBoxesToolDescription =
  "Use only when the user explicitly refers to box cards selected in ShrineKeep's dashboard UI or asks for an action on that selection. Returns compact selected-box application state—ids, names, parent ids, and update versions—with pagination. Do not call this for general page context, new-box initialization, or current-box completion. Selected boxes never choose the destination of a staging tool."

export function selectedItemsToolDescription(page: "dashboard" | "wishlist") {
  const scope = page === "wishlist" ? "wishlist cards" : "owned or wishlist cards in the open box"
  return `Use only when the user explicitly refers to selected cards or asks to update only their current UI selection. Reads selected ${scope} with compact editable state, including descriptions and current tags; photos are omitted. Do not call this before setting up a new collection or completing an entire current-box collection. For whole-box work, use the owned and wishlist current-box read tools instead. ${descriptionReadGuidance} ${pricingResearchGuidance}`
}

export function collectionInitializationToolDescription(currentBoxName: string) {
  return `Use only to onboard a brand-new researched collection as a new child box under the currently open box ${quotedScope(currentBoxName)}. UI-selected boxes and items do not affect this destination; do not call get_selected_boxes or get_selected_items first. Never use this to complete or amend the open box; use stage_items_in_current_box instead. Research and show the exact matched set in chat before approval. ${creationNameGuidance} ${creationApprovalGuidance} ${creationPricingGuidance} ${pricingResearchGuidance}`
}

export function currentBoxItemCreationToolDescription(currentBoxName: string) {
  return `Use to stage any new owned or wishlist cards directly in the currently open box ${quotedScope(currentBoxName)}, whether the user names one item, a batch of unrelated items, or asks to complete or extend a collection; this never creates a child box. For ordinary user-specified additions, use the requested products and Owned/Wishlist statuses—collection research and current-box reads are not prerequisites unless needed to resolve ambiguity or avoid duplicates. Do not call selection tools unless the user explicitly asks to act on selected cards. For “Complete the collection in my current box,” first read and paginate both get_current_box_items and get_current_box_wishlist_items, compare them with the researched list, and omit every existing card. Present agent-derived or researched rows and proposed Owned/Wishlist statuses in chat; missing items default to Wishlist unless the user says they possess them. ${creationNameGuidance} ${creationApprovalGuidance} ${creationPricingGuidance} ${pricingResearchGuidance}`
}
