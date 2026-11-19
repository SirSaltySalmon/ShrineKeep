export interface MarkAcquiredInput {
  id: string
  acquisitionDate: string
  acquisitionPrice: number | null
  /** Box the item lands in; null for the root. */
  boxId: string | null
}

export type MarkAcquiredResult = { ok: true } | { ok: false; reason: "item_limit_reached" }

const GENERIC_FAILURE = "Could not mark the item as acquired. Try again."

/**
 * Turns a wishlist item into a collection item through PATCH /api/items.
 * Resolves `{ ok: false, reason: "item_limit_reached" }` when the free-tier cap rejects it.
 * Throws an Error with a message fit to show the user for any other failure.
 */
export async function markItemAcquired(input: MarkAcquiredInput): Promise<MarkAcquiredResult> {
  let response: Response
  try {
    response = await fetch("/api/items", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: input.id,
        is_wishlist: false,
        acquisition_date: input.acquisitionDate,
        acquisition_price: input.acquisitionPrice,
        box_id: input.boxId,
        wishlist_target_box_id: null,
      }),
    })
  } catch {
    // fetch rejects with browser-specific text ("Failed to fetch", "Load failed").
    throw new Error("Could not reach the server. Check your connection and try again.")
  }

  if (response.ok) return { ok: true }

  const payload = (await response.json().catch(() => null)) as { error?: unknown } | null
  if (response.status === 403 && payload?.error === "item_limit_reached") {
    return { ok: false, reason: "item_limit_reached" }
  }
  const message = payload?.error
  throw new Error(typeof message === "string" && message ? message : GENERIC_FAILURE)
}
