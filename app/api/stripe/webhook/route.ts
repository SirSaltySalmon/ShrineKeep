import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import Stripe from "stripe"
import { createSupabaseServiceClient } from "@/lib/supabase/service"
import { getStripeWebhookSecret, stripe } from "@/lib/stripe/server"

export const runtime = "nodejs"

type DbSubscriptionStatus = "active" | "canceled" | "past_due"

/**
 * End of the current billing period as ISO string.
 * API 2025+ (e.g. basil / dahlia): period lives on subscription *items*, not the subscription root.
 */
function subscriptionPeriodEndToIso(sub: Stripe.Subscription): string | null {
  const items = sub.items?.data
  if (items?.length) {
    const ends = items
      .map((i) => i.current_period_end)
      .filter((n): n is number => typeof n === "number" && Number.isFinite(n))
    if (ends.length > 0) {
      return new Date(Math.max(...ends) * 1000).toISOString()
    }
  }
  return null
}

/** Map Stripe subscription.status to our CHECK constraint (add_subscriptions.sql). */
function stripeSubscriptionStatusToDb(status: Stripe.Subscription.Status): DbSubscriptionStatus {
  switch (status) {
    case "active":
    case "trialing":
      return "active"
    case "past_due":
    case "unpaid":
      return "past_due"
    case "canceled":
    case "incomplete":
    case "incomplete_expired":
    case "paused":
    default:
      return "canceled"
  }
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const fromParent = invoice.parent?.subscription_details?.subscription
  if (typeof fromParent === "string") return fromParent
  if (
    fromParent &&
    typeof fromParent === "object" &&
    "id" in fromParent &&
    typeof fromParent.id === "string"
  ) {
    return fromParent.id
  }
  return null
}

/** Webhook payloads may send `customer` as an id string or an expanded object. */
function subscriptionCustomerId(sub: Stripe.Subscription): string | null {
  const c = sub.customer
  if (typeof c === "string") return c
  if (c && typeof c === "object" && "id" in c && typeof (c as { id: unknown }).id === "string") {
    return (c as { id: string }).id
  }
  return null
}

/**
 * Keep DB status and billing period aligned with Stripe after invoice or subscription events.
 */
type ServiceSupabase = ReturnType<typeof createSupabaseServiceClient>

type SubscriptionRowPatch = {
  stripe_subscription_id?: string
  status?: DbSubscriptionStatus
  current_period_end?: string | null
}

/**
 * Match the subscriptions row by Stripe customer id first, then by subscription id.
 * Relying only on `customer` as a string breaks when Stripe sends an expanded Customer object.
 */
async function updateSubscriptionByStripeRefs(
  supabase: ServiceSupabase,
  patch: SubscriptionRowPatch,
  refs: { customerId: string | null; subscriptionId: string }
): Promise<{ error: Error | null }> {
  const { customerId, subscriptionId } = refs

  if (customerId) {
    const { data, error } = await supabase
      .from("subscriptions")
      .update(patch)
      .eq("stripe_customer_id", customerId)
      .select("id")
    if (error) return { error: new Error(error.message) }
    if (data && data.length > 0) return { error: null }
  }

  const { data: data2, error: error2 } = await supabase
    .from("subscriptions")
    .update(patch)
    .eq("stripe_subscription_id", subscriptionId)
    .select("id")

  if (error2) return { error: new Error(error2.message) }
  if (!data2?.length) {
    console.error("[stripe/webhook] No subscriptions row matched for update", {
      customerId,
      subscriptionId,
      patchKeys: Object.keys(patch),
    })
  }
  return { error: null }
}

async function syncSubscriptionRowFromStripe(
  supabase: ServiceSupabase,
  stripeSub: Stripe.Subscription
): Promise<{ error: Error | null }> {
  const customerId = subscriptionCustomerId(stripeSub)
  const periodEnd = subscriptionPeriodEndToIso(stripeSub)
  const status = stripeSubscriptionStatusToDb(stripeSub.status)

  const patch: SubscriptionRowPatch = {
    stripe_subscription_id: stripeSub.id,
    status,
  }
  if (periodEnd != null) patch.current_period_end = periodEnd

  return updateSubscriptionByStripeRefs(supabase, patch, {
    customerId,
    subscriptionId: stripeSub.id,
  })
}

// Raw body is required for Stripe signature verification.
// Next.js App Router gives us the raw body via request.text().
export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get("stripe-signature")

  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, getStripeWebhookSecret())
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook signature verification failed"
    console.error("[stripe/webhook] Signature error:", message)
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const supabase = createSupabaseServiceClient()

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode !== "subscription") break

        const customerId = typeof session.customer === "string" ? session.customer : null
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : null
        if (!customerId || !subscriptionId) {
          console.error("[stripe/webhook] checkout.session.completed missing customer/subscription id")
          break
        }

        // Fetch subscription to get metadata (supabase_user_id) and billing period
        const stripeSub = await stripe.subscriptions.retrieve(subscriptionId)
        const userId = stripeSub.metadata.supabase_user_id

        if (!userId) {
          console.error("[stripe/webhook] Missing supabase_user_id in subscription metadata")
          break
        }

        const periodEnd = subscriptionPeriodEndToIso(stripeSub)

        const dbStatus = stripeSubscriptionStatusToDb(stripeSub.status)

        const { error } = await supabase.from("subscriptions").upsert(
          {
            user_id: userId,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            status: dbStatus,
            current_period_end: periodEnd,
          },
          { onConflict: "user_id" }
        )

        if (error) {
          console.error("[stripe/webhook] checkout.session.completed upsert error:", error)
          return NextResponse.json({ error: "DB upsert failed" }, { status: 500 })
        }

        console.log(`[stripe/webhook] User ${userId} subscribed (${subscriptionId})`)
        break
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription
        const customerId = subscriptionCustomerId(sub)
        const status = stripeSubscriptionStatusToDb(sub.status)

        const periodEnd2 = subscriptionPeriodEndToIso(sub)

        const patch: SubscriptionRowPatch = {
          stripe_subscription_id: sub.id,
          status,
        }
        if (periodEnd2 != null) patch.current_period_end = periodEnd2

        const { error } = await updateSubscriptionByStripeRefs(supabase, patch, {
          customerId,
          subscriptionId: sub.id,
        })

        if (error) {
          console.error("[stripe/webhook] customer.subscription.updated error:", error)
          return NextResponse.json({ error: "DB update failed" }, { status: 500 })
        }
        break
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription
        const customerId = subscriptionCustomerId(sub)

        const { error } = await updateSubscriptionByStripeRefs(
          supabase,
          { status: "canceled" },
          { customerId, subscriptionId: sub.id }
        )

        if (error) {
          console.error("[stripe/webhook] customer.subscription.deleted error:", error)
          return NextResponse.json({ error: "DB update failed" }, { status: 500 })
        }
        break
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice
        const subId = invoiceSubscriptionId(invoice)
        if (!subId) {
          console.error("[stripe/webhook] invoice.payment_failed missing subscription id")
          break
        }

        try {
          const stripeSub = await stripe.subscriptions.retrieve(subId)
          const { error } = await syncSubscriptionRowFromStripe(supabase, stripeSub)
          if (error) {
            console.error("[stripe/webhook] invoice.payment_failed sync error:", error)
            return NextResponse.json({ error: "DB update failed" }, { status: 500 })
          }
        } catch (err) {
          console.error("[stripe/webhook] invoice.payment_failed retrieve error:", err)
        }
        break
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice
        const subId = invoiceSubscriptionId(invoice)
        if (subId == null) break

        try {
          const stripeSub = await stripe.subscriptions.retrieve(subId)
          const { error } = await syncSubscriptionRowFromStripe(supabase, stripeSub)
          if (error) {
            console.error("[stripe/webhook] invoice.paid sync error:", error)
            return NextResponse.json({ error: "DB update failed" }, { status: 500 })
          }
        } catch (err) {
          console.error("[stripe/webhook] invoice.paid retrieve error:", err)
        }
        break
      }

      default:
        // Unhandled event type — ignore
        break
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook handler error"
    console.error("[stripe/webhook] Handler error:", message, err)
    return NextResponse.json({ error: message }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
