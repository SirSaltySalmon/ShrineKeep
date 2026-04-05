import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { Theme } from "@/lib/types"
import DashboardClient from "./dashboard-client"
import { getSubscriptionStatus, getItemCount, getEffectiveCap, FREE_TIER_CAP } from "@/lib/subscription"

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) {
    redirect("/auth/login")
  }

  const [{ data: user }, { data: settings }, subscription, itemCount] = await Promise.all([
    supabase.from("users").select("*").eq("id", authUser.id).single(),
    supabase.from("user_settings").select("color_scheme, graph_overlay").eq("user_id", authUser.id).single(),
    getSubscriptionStatus(supabase, authUser.id),
    getItemCount(supabase, authUser.id),
  ])

  const cap = await getEffectiveCap(supabase, authUser.id, subscription.isPro)

  const colorScheme = settings?.color_scheme as Theme | null | undefined
  const theme: Theme | null =
    colorScheme && typeof colorScheme === "object" ? { ...colorScheme } : null
  const graphOverlay = settings?.graph_overlay ?? true

  return (
    <DashboardClient
      user={user}
      initialTheme={theme}
      initialGraphOverlay={graphOverlay}
      isPro={subscription.isPro}
      subscriptionStatus={subscription.status}
      pastDueGraceEndsAt={subscription.pastDueGraceEndsAt?.toISOString() ?? null}
      itemCount={itemCount}
      itemCap={isFinite(cap) ? cap : null}
      freeTierCap={FREE_TIER_CAP}
    />
  )
}
