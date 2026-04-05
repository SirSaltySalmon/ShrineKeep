import type { createSupabaseServerClient } from "@/lib/supabase/server"

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

export const FREE_TIER_CAP = 50

/**
 * After the billing period ends, `past_due` subscribers keep Pro access for this many
 * calendar days (see `getPastDueGraceEndsAt`).
 */
export const PAST_DUE_GRACE_DAYS = 7

/** Exact phrase required to confirm immediate subscription end (billing settings). */
export const END_SUBSCRIPTION_NOW_CONFIRMATION_PHRASE =
  "I would like to end my remaining subscription"

export interface SubscriptionStatus {
  isPro: boolean
  status: "active" | "canceled" | "past_due" | null
  currentPeriodEnd: Date | null
  /** End of Pro grace when status is `past_due` and `currentPeriodEnd` is known; otherwise null. */
  pastDueGraceEndsAt: Date | null
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
}

export function addPastDueGraceDays(periodEnd: Date): Date {
  const d = new Date(periodEnd)
  d.setDate(d.getDate() + PAST_DUE_GRACE_DAYS)
  return d
}

export function getPastDueGraceEndsAt(
  status: string | null | undefined,
  currentPeriodEnd: Date | null
): Date | null {
  if (status !== "past_due" || !currentPeriodEnd) return null
  return addPastDueGraceDays(currentPeriodEnd)
}

/**
 * Pro access for server-side enforcement (e.g. item cap).
 *
 * Fail-closed: on query error or exception, returns false so limits still apply
 * and free tier cannot bypass caps when subscriptions are unreadable.
 *
 * past_due users retain Pro access until `current_period_end` + PAST_DUE_GRACE_DAYS.
 */
export async function isProUser(supabase: Supabase, userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("status, current_period_end")
      .eq("user_id", userId)
      .maybeSingle()

    if (error) {
      console.error("[subscription] isProUser query error, failing closed for enforcement:", error)
      return false
    }

    if (!data) return false
    if (data.status === "active") return true

    if (data.status === "past_due" && data.current_period_end) {
      const graceEnd = addPastDueGraceDays(new Date(data.current_period_end))
      return new Date() <= graceEnd
    }

    return false
  } catch (err) {
    console.error("[subscription] isProUser unexpected error, failing closed for enforcement:", err)
    return false
  }
}

/**
 * Get full subscription status for display (settings, dashboard banner).
 */
export async function getSubscriptionStatus(
  supabase: Supabase,
  userId: string
): Promise<SubscriptionStatus> {
  try {
    const { data } = await supabase
      .from("subscriptions")
      .select("status, current_period_end, stripe_customer_id, stripe_subscription_id")
      .eq("user_id", userId)
      .maybeSingle()

    if (!data) {
      return {
        isPro: false,
        status: null,
        currentPeriodEnd: null,
        pastDueGraceEndsAt: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      }
    }

    const currentPeriodEnd = data.current_period_end ? new Date(data.current_period_end) : null
    const pastDueGraceEndsAt = getPastDueGraceEndsAt(data.status, currentPeriodEnd)

    let isPro = false
    if (data.status === "active") {
      isPro = true
    } else if (data.status === "past_due" && currentPeriodEnd) {
      isPro = new Date() <= addPastDueGraceDays(currentPeriodEnd)
    }

    return {
      isPro,
      status: data.status as SubscriptionStatus["status"],
      currentPeriodEnd,
      pastDueGraceEndsAt,
      stripeCustomerId: data.stripe_customer_id,
      stripeSubscriptionId: data.stripe_subscription_id ?? null,
    }
  } catch {
    return {
      isPro: false,
      status: null,
      currentPeriodEnd: null,
      pastDueGraceEndsAt: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    }
  }
}

/**
 * Count non-wishlist items for a user.
 */
export async function getItemCount(supabase: Supabase, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("items")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_wishlist", false)

  if (error) throw error
  return count ?? 0
}

/**
 * Get the effective item cap for a user.
 *
 * Grandfathered users (existing users at launch with > 50 items) get
 * Math.max(grandfathered_item_count, FREE_TIER_CAP) as their cap.
 * Pro users get Infinity.
 */
export async function getEffectiveCap(
  supabase: Supabase,
  userId: string,
  isPro: boolean
): Promise<number> {
  if (isPro) return Infinity

  const { data } = await supabase
    .from("users")
    .select("grandfathered_item_count")
    .eq("id", userId)
    .single()

  const grandfathered = data?.grandfathered_item_count ?? null
  if (grandfathered !== null && grandfathered > FREE_TIER_CAP) {
    return grandfathered
  }

  return FREE_TIER_CAP
}
