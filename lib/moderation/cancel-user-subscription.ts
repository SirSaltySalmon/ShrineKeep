import type { SupabaseClient } from "@supabase/supabase-js"
import type Stripe from "stripe"
import { stripe } from "@/lib/stripe/server"

/** Stripe subscription statuses we attempt to end immediately via cancel(). */
const CANCELLABLE_STATUSES: Stripe.Subscription.Status[] = [
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "incomplete",
  "paused",
]

/**
 * Cancels the user's Pro subscription in Stripe when applicable.
 * Call while `public.subscriptions` row still exists (before Auth delete).
 */
export async function cancelUserProSubscription(
  supabase: SupabaseClient,
  userId: string
): Promise<{ includeSubscriptionCancelledNotice: boolean; subscriptionCancelled: boolean }> {
  const { data: row, error } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("user_id", userId)
    .maybeSingle()

  if (error) {
    throw new Error(`subscriptions lookup: ${error.message}`)
  }

  const stripeSubscriptionId = row?.stripe_subscription_id
  if (!stripeSubscriptionId) {
    return { includeSubscriptionCancelledNotice: false, subscriptionCancelled: false }
  }

  const stripeSub = await stripe.subscriptions.retrieve(stripeSubscriptionId)
  let subscriptionCancelled = false

  if (CANCELLABLE_STATUSES.includes(stripeSub.status)) {
    await stripe.subscriptions.cancel(stripeSubscriptionId)
    subscriptionCancelled = true
  }

  return { includeSubscriptionCancelledNotice: true, subscriptionCancelled }
}
