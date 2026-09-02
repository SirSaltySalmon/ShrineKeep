function quotedScope(scopeName: string) {
  return JSON.stringify(scopeName || "Root")
}

export const pricingResearchGuidance =
  "Identify the exact item and variant from names, descriptions, and links. Use reputable, current sources appropriate to each price field. If a link is inaccessible, stale, or mismatched, continue from verified item details. A valuation request does not authorize description changes; preserve personal notes."

export const priceApproachApprovalGuidance =
  "For each price field the user asked to research, suggest suitable approaches in chat and wait. Do not start researching until the user has approved an approach for every requested field. Then research every card using only those approved approaches before the single staging call."

export const descriptionReadGuidance =
  "Descriptions are truncated to 300 characters by default; request include_full_description when needed."

export const creationNameGuidance =
  "Name each owned or wishlist item so it immediately identifies the exact product on its own. Automatic thumbnail searches use the name, so include a short verified brand, maker, product line, or variant identifier when needed, example: 'YouTooz Astarion vinyl figure' instead of 'Astarion vinyl figure'. Keep names concise and never invent identifiers."

export const creationDescriptionGuidance =
  "Keep the item-focused description to 100 characters or fewer, excluding requested links. If links are requested, including option C, append each URL as plain text on its own line, without labels or Markdown. Do not include prices, price bases, timestamps, research notes, or other irrelevant information in the description; use the dedicated price, rationale, and source_urls fields for research evidence."

export const creationApprovalGuidance =
  "Before staging a proposed list, offer A: Approve list only; B: Approve list and research prices for each item; C: Approve list, research prices, and attach evidence links to description. C is recommended for more reliable future valuations. A bare yes approves the list only unless prices were already requested. Set attach_price_evidence=true only for explicit C approval or an equivalent request. Omit unsupported details and never invent missing prices."

const creationPricingGuidance =
  `If prices are requested: ${priceApproachApprovalGuidance} Wishlist items may receive expected_price; owned items may receive acquisition_price and current_value. Research only the fields the user asked for—do not fill acquisition_price on a valuation-only request. acquisition_price is an editable estimate of original or historical cost, not necessarily what the user paid. Shipping is excluded; all price fields are USD. Include concise price-basis rationales and source URLs.`

export const includeDescendantsFieldDescription = "Include possessed items in nested boxes."

export const attachPriceEvidenceFieldDescription =
  "True only after explicit option C approval or an equivalent request to save evidence in descriptions."

export const userConfirmedMatchFieldDescription =
  "True only after the user approved the displayed matched set in chat. Price research is included only when the user chose it or requested it earlier."

export const creationStatusFieldDescription =
  "Use owned only when the user says they possess the item; otherwise use wishlist."

export const creationEvidenceDescriptionFieldDescription = `Only with attach_price_evidence=true. ${creationDescriptionGuidance}`

export const currentValueFieldDescription =
  "Present market value in USD, shipping excluded. Allowed for owned and wishlist items."

export const acquisitionPriceFieldDescription =
  "Owned only: editable estimate of likely original retail or historical market price in USD; not the user's known actual payment."

export const expectedPriceFieldDescription =
  "Wishlist only: estimated price to acquire the item in USD, shipping excluded."

export const creationRationaleFieldDescription = "Concise evidence basis for supplied prices."

export const replacementDescriptionFieldDescription =
  "Replacement description. Use an empty string to clear it."

export const ownedEditRationaleFieldDescription = "Concise evidence basis for supplied prices."

export const wishlistEditRationaleFieldDescription = "Concise evidence basis for supplied prices."

export function selectedItemsToolDescription(page: "dashboard" | "wishlist") {
  const scope = page === "wishlist" ? "wishlist cards" : "owned or wishlist cards in the open box"
  return `Use when the user refers to selected cards or the current UI selection. Reads selected ${scope} with compact editable state. ${descriptionReadGuidance}`
}

export function currentBoxItemsToolDescription(currentBoxName: string) {
  return `Read possessed items in the open box ${quotedScope(currentBoxName)}. ${descriptionReadGuidance}`
}

export function itemEditsToolDescription() {
  return `Stage sparse edits for possessed items: name, description, current_value, and acquisition_price. ${priceApproachApprovalGuidance} ${pricingResearchGuidance} Read full descriptions before proposing description additions.`
}

export function collectionInitializationToolDescription(currentBoxName: string) {
  return `Onboard a researched collection as a new child box under the currently open box ${quotedScope(currentBoxName)}. Research and show the matched set in chat before approval. ${creationNameGuidance} ${creationApprovalGuidance} ${creationPricingGuidance}`
}

export function currentBoxItemCreationToolDescription(currentBoxName: string) {
  return `Stage new owned or wishlist cards in the currently open box ${quotedScope(currentBoxName)}, whether the user names one item, a batch, or asks to complete the collection. For ordinary additions, use the requested products and Owned/Wishlist statuses. For completing the collection, first read and paginate get_current_box_items and get_current_box_wishlist_items, omit every existing card, and default missing items to Wishlist unless the user says they possess them. ${creationNameGuidance} ${creationApprovalGuidance} ${creationPricingGuidance}`
}

export function wishlistContextToolDescription(page: "dashboard" | "wishlist", currentBoxName: string) {
  return page === "wishlist"
    ? `Read all wishlist items with their associated box names. ${descriptionReadGuidance}`
    : `Read wishlist items associated with the open box ${quotedScope(currentBoxName)}. ${descriptionReadGuidance}`
}

export function wishlistEditsToolDescription(page: "dashboard" | "wishlist") {
  const scope =
    page === "wishlist"
      ? "wishlist items, using each associated box name as research context"
      : "wishlist items in the open box"
  return `Stage sparse edits for ${scope}: name, description, current_value, and expected_price. ${priceApproachApprovalGuidance} ${pricingResearchGuidance} Read full descriptions before proposing description additions.`
}
