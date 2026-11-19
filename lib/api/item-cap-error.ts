import { NextResponse } from "next/server"

/**
 * Thrown when a user attempts to create items beyond their free tier cap.
 * API routes turn it into a response with {@link itemCapResponse}.
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

// The whole message, not a substring: other database errors echo caller input
// (a bad numeric literal, say), which must not read as a cap hit.
const DB_CAP_MESSAGE = /^item_limit_reached:(\d+):(\d+)$/

/**
 * Map the database's `item_limit_reached:<count>:<cap>` error (raised with P0001 by
 * `sharing_private.enforce_item_cap` and `paste_box_trees_atomic`) to ItemCapExceededError.
 */
export function itemCapErrorFromDb(error: unknown): ItemCapExceededError | null {
  if (typeof error !== "object" || error === null) return null
  const code = "code" in error ? error.code : undefined
  const message = "message" in error ? error.message : undefined
  if (code !== "P0001" || typeof message !== "string") return null
  const match = DB_CAP_MESSAGE.exec(message)
  return match ? new ItemCapExceededError(Number(match[1]), Number(match[2])) : null
}

/**
 * The 403 every route answers when the cap rejects a write, or null when `error` is
 * something else. Accepts an ItemCapExceededError or the raw database error.
 */
export function itemCapResponse(error: unknown): NextResponse | null {
  const capError = error instanceof ItemCapExceededError ? error : itemCapErrorFromDb(error)
  if (!capError) return null
  return NextResponse.json(
    { error: "item_limit_reached", currentCount: capError.currentCount, cap: capError.cap },
    { status: 403 }
  )
}
