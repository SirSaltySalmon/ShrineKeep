import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { stripe } from "@/lib/stripe/server"
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

    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle()

    if (!subscription?.stripe_customer_id) {
      return NextResponse.json({ error: "No subscription found" }, { status: 404 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (!appUrl) {
      captureRouteMessage(
        "Missing NEXT_PUBLIC_APP_URL for Stripe portal",
        {
          area: "stripe",
          route: "/api/stripe/portal",
          userId: user.id,
          tags: { operation: "portal" },
        },
        "error"
      )
      return NextResponse.json({ error: "Missing NEXT_PUBLIC_APP_URL" }, { status: 500 })
    }

    const portalSession = await startRouteSpan(
      "stripe.portal.create_session",
      "http.server",
      {
        "feature.area": "stripe",
        "feature.operation": "portal",
      },
      () =>
        stripe.billingPortal.sessions.create({
          customer: subscription.stripe_customer_id,
          return_url: `${appUrl}/settings`,
        })
    )

    return NextResponse.json({ url: portalSession.url })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create portal session"
    console.error("[stripe/portal] Error:", message, error)
    captureRouteException(error, {
      area: "stripe",
      route: "/api/stripe/portal",
      userId,
      tags: { operation: "portal" },
    })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
