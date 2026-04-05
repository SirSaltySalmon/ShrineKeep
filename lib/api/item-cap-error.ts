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
