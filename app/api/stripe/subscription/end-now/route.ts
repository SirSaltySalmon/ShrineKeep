import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase/service"
import { END_SUBSCRIPTION_NOW_CONFIRMATION_PHRASE } from "@/lib/subscription"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { stripe } from "@/lib/stripe/server"
import { stripeSubscriptionHasScheduledCancellation } from "@/lib/stripe/subscription-state"
import {
  captureRouteException,
  startRouteSpan,
} from "@/lib/monitoring/sentry"

export const runtime = "nodejs"

/**
 * POST /api/stripe/subscription/end-now
 * Immediately cancels a subscription that was already set to cancel at period end.
 * Body: { confirmation: string } — must match END_SUBSCRIPTION_NOW_CONFIRMATION_PHRASE exactly.
 */
export async function POST(request: NextRequest) {
  let userId: string | null = null
  try {
    const body = (await request.json()) as { confirmation?: unknown }
    const confirmation = typeof body.confirmation === "string" ? body.confirmation : ""

    if (confirmation !== END_SUBSCRIPTION_NOW_CONFIRMATION_PHRASE) {
      return NextResponse.json(
        { error: "Type the confirmation phrase exactly as shown." },
        { status: 400 }
      )
    }

    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    userId = user?.id ?? null

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: row } = await supabase
      .from("subscriptions")
      .select("stripe_subscription_id")
      .eq("user_id", user.id)
      .maybeSingle()

    const stripeSubscriptionId = row?.stripe_subscription_id
    if (!stripeSubscriptionId) {
      return NextResponse.json({ error: "No subscription found" }, { status: 404 })
    }

    const stripeSub = await startRouteSpan(
      "stripe.subscription.retrieve_for_end_now",
      "http.server",
      {
        "feature.area": "stripe",
        "feature.operation": "subscription_end_now",
      },
      () => stripe.subscriptions.retrieve(stripeSubscriptionId)
    )

    const canEndNow =
      stripeSubscriptionHasScheduledCancellation(stripeSub) &&
      (stripeSub.status === "active" ||
        stripeSub.status === "trialing" ||
        stripeSub.status === "past_due")

    if (!canEndNow) {
      return NextResponse.json(
        {
          error:
            "You can only end your subscription early after canceling it in the billing portal (so it is scheduled to end at the end of the billing period).",
        },
        { status: 400 }
      )
    }

    await startRouteSpan(
      "stripe.subscription.cancel_now",
      "http.server",
      {
        "feature.area": "stripe",
        "feature.operation": "subscription_end_now",
      },
      () => stripe.subscriptions.cancel(stripeSubscriptionId)
    )

    const service = createSupabaseServiceClient()
    const { error: dbError } = await service
      .from("subscriptions")
      .update({ status: "canceled", current_period_end: new Date().toISOString() })
      .eq("user_id", user.id)

    if (dbError) {
      console.error("[stripe/subscription/end-now] DB update error:", dbError)
      captureRouteException(dbError, {
        area: "stripe",
        route: "/api/stripe/subscription/end-now",
        userId: user.id,
        tags: {
          operation: "subscription_end_now",
        },
      })
      return NextResponse.json(
        { error: "Subscription ended in Stripe but failed to update billing status. Please refresh or contact support." },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to end subscription"
    console.error("[stripe/subscription/end-now] Error:", message, error)
    captureRouteException(error, {
      area: "stripe",
      route: "/api/stripe/subscription/end-now",
      userId,
      tags: {
        operation: "subscription_end_now",
      },
    })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
