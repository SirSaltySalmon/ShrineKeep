import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { getStripePriceId, stripe } from "@/lib/stripe/server"
import {
  captureRouteException,
  captureRouteMessage,
  startRouteSpan,
} from "@/lib/monitoring/sentry"

export const runtime = "nodejs"

export async function POST() {
  let userId: string | null = null
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    userId = user?.id ?? null

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (!appUrl) {
      captureRouteMessage(
        "Missing NEXT_PUBLIC_APP_URL for Stripe checkout",
        {
          area: "stripe",
          route: "/api/stripe/checkout",
          userId: user.id,
          tags: { operation: "checkout" },
        },
        "error"
      )
      return NextResponse.json({ error: "Missing NEXT_PUBLIC_APP_URL" }, { status: 500 })
    }

    // Check if user already has a Stripe customer ID
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id, status")
      .eq("user_id", user.id)
      .maybeSingle()

    if (subscription?.status === "active" || subscription?.status === "past_due") {
      return NextResponse.json(
        { error: "Subscription already exists. Please manage billing in Settings." },
        { status: 400 }
      )
    }

    let customerId = subscription?.stripe_customer_id ?? undefined

    // Create Stripe customer if one doesn't exist
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      })
      customerId = customer.id
    }

    const session = await startRouteSpan(
      "stripe.checkout.create_session",
      "http.server",
      {
        "feature.area": "stripe",
        "feature.operation": "checkout",
      },
      () =>
        stripe.checkout.sessions.create({
          customer: customerId,
          mode: "subscription",
          payment_method_types: ["card"],
          line_items: [
            {
              price: getStripePriceId(),
              quantity: 1,
            },
          ],
          success_url: `${appUrl}/dashboard?upgraded=true`,
          cancel_url: `${appUrl}/dashboard`,
          subscription_data: {
            metadata: { supabase_user_id: user.id },
          },
        })
    )

    return NextResponse.json({ url: session.url })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create checkout session"
    console.error("[stripe/checkout] Error:", message, error)
    captureRouteException(error, {
      area: "stripe",
      route: "/api/stripe/checkout",
      userId,
      tags: { operation: "checkout" },
    })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
