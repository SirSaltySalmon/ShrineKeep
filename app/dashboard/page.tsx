import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { Theme } from "@/lib/types"
import DashboardClient from "./dashboard-client"
import { getSubscriptionStatus, getItemCount, getEffectiveCap, FREE_TIER_CAP } from "@/lib/subscription"
import { loadDashboardRootData } from "@/lib/services/dashboard/load-dashboard-root"

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) {
    redirect("/auth/login")
  }

  const [{ data: user }, { data: settings }, rootData, subscription, itemCount] = await Promise.all([
    supabase.from("users").select("*").eq("id", authUser.id).single(),
    supabase
      .from("user_settings")
      .select("color_scheme, graph_overlay, dashboard_demo_prompt_dismissed")
      .eq("user_id", authUser.id)
      .maybeSingle(),
    loadDashboardRootData(supabase, authUser.id),
    getSubscriptionStatus(supabase, authUser.id),
    getItemCount(supabase, authUser.id),
  ])

  const cap = await getEffectiveCap(supabase, authUser.id, subscription.isPro)

  const colorScheme = settings?.color_scheme as Theme | null | undefined
  const theme: Theme | null =
    colorScheme && typeof colorScheme === "object" ? { ...colorScheme } : null
  const graphOverlay = settings?.graph_overlay ?? true
  const demoPromptDismissed = settings?.dashboard_demo_prompt_dismissed ?? false

  return (
    <DashboardClient
      user={user}
      initialTheme={theme}
      initialGraphOverlay={graphOverlay}
      demoPromptDismissed={demoPromptDismissed}
      isPro={subscription.isPro}
      subscriptionStatus={subscription.status}
      pastDueGraceEndsAt={subscription.pastDueGraceEndsAt?.toISOString() ?? null}
      itemCount={itemCount}
      itemCap={isFinite(cap) ? cap : null}
      freeTierCap={FREE_TIER_CAP}
      initialBoxes={rootData.initialBoxes}
      initialItems={rootData.initialItems}
      initialUserTags={rootData.initialTags}
    />
  )
}
