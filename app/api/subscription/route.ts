import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { stripe } from "@/lib/stripe/server"
import {
  stripeSubscriptionCancelAtIso,
  stripeSubscriptionHasScheduledCancellation,
} from "@/lib/stripe/subscription-state"
import {
  getSubscriptionStatus,
  getItemCount,
  FREE_TIER_CAP,
  getEffectiveCap,
  PAST_DUE_GRACE_DAYS,
} from "@/lib/subscription"

export const runtime = "nodejs"

/**
 * GET /api/subscription
 * Returns the user's subscription status and item count for dashboard display.
 */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const [subscription, itemCount] = await Promise.all([
      getSubscriptionStatus(supabase, user.id),
      getItemCount(supabase, user.id),
    ])

    const cap = await getEffectiveCap(supabase, user.id, subscription.isPro)

    /** True when the subscription is still active in Stripe but set to end at a future time. */
    let cancelAtPeriodEnd = false
    /** Stripe `cancel_at` as ISO when set (may be set without `cancel_at_period_end` in flexible billing). */
    let cancelAt: string | null = null
    if (subscription.stripeSubscriptionId) {
      try {
        const stripeSub = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId)
        cancelAtPeriodEnd = stripeSubscriptionHasScheduledCancellation(stripeSub)
        cancelAt = stripeSubscriptionCancelAtIso(stripeSub)
      } catch (err) {
        console.error("[subscription] Stripe retrieve for scheduled cancellation:", err)
      }
    }

    return NextResponse.json({
      isPro: subscription.isPro,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
      pastDueGraceDays: PAST_DUE_GRACE_DAYS,
      pastDueGraceEndsAt: subscription.pastDueGraceEndsAt?.toISOString() ?? null,
      cancelAtPeriodEnd,
      cancelAt,
      itemCount,
      cap: isFinite(cap) ? cap : null,
      freeTierCap: FREE_TIER_CAP,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to get subscription"
    console.error("[subscription] GET error:", message, error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
