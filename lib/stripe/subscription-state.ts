import type Stripe from "stripe"

/**
 * Stripe may schedule cancellation via `cancel_at_period_end` or by setting `cancel_at`
 * (e.g. flexible billing / customer portal) without setting `cancel_at_period_end` to true.
 */
export function stripeSubscriptionHasScheduledCancellation(sub: Stripe.Subscription): boolean {
  if (sub.cancel_at_period_end === true) return true
  if (typeof sub.cancel_at === "number" && Number.isFinite(sub.cancel_at) && sub.cancel_at > 0) {
    return true
  }
  return false
}

/** Unix `cancel_at` as ISO, or null if not scheduled that way. */
export function stripeSubscriptionCancelAtIso(sub: Stripe.Subscription): string | null {
  if (typeof sub.cancel_at !== "number" || !Number.isFinite(sub.cancel_at) || sub.cancel_at <= 0) {
    return null
  }
  return new Date(sub.cancel_at * 1000).toISOString()
}
