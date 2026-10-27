/**
 * Thrown when a user attempts to create items beyond their free tier cap.
 * API routes catch this and return HTTP 403 with { error: "item_limit_reached" }.
 */
export class ItemCapExceededError extends Error {
  readonly currentCount: number
  readonly cap: number

  constructor(currentCount: number, cap: number) {
    super(`Item limit reached: ${currentCount} of ${cap} items used`)
    this.name = "ItemCapExceededError"
    this.currentCount = currentCount
    this.cap = cap
  }
}

/**
 * Map the database trigger's `item_limit_reached:<count>:<cap>` error (raised by
 * `sharing_private.enforce_item_cap` and `paste_box_trees_atomic`) to ItemCapExceededError.
 */
export function itemCapErrorFromDb(error: unknown): ItemCapExceededError | null {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message: unknown }).message)
      : ""
  const match = /item_limit_reached:(\d+):(\d+)/.exec(message)
  return match ? new ItemCapExceededError(Number(match[1]), Number(match[2])) : null
}
