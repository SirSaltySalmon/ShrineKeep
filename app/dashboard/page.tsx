import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase/service"
import { createSharingMutationCore } from "@/lib/sharing/server/mutation-core"
import type { DashboardOwnerSharing } from "@/lib/sharing/box-editor"
import type { Theme } from "@/lib/types"
import DashboardClient from "./dashboard-client"
import { getSubscriptionStatus, getItemCount, getEffectiveCap, FREE_TIER_CAP } from "@/lib/subscription"
import { loadDashboardRootData } from "@/lib/services/dashboard/load-dashboard-root"

async function loadOwnerSharing(userId: string): Promise<DashboardOwnerSharing | undefined> {
  if (process.env.SOCIAL_SHARING_EDITS_ENABLED !== "true") return { available: false }
  try {
    const service = createSupabaseServiceClient()
    const core = createSharingMutationCore((name, args) => service.rpc(name, args))
    const sharing = await core.readOwnerSettings(userId)
    if (!sharing.ok) return undefined
    return {
      available: true,
      revision: sharing.data.revision,
      wishlistGuestVisibleCount: sharing.data.wishlistGuestVisibleCount,
      wishlistGuestTotalCount: sharing.data.wishlistGuestTotalCount,
    }
  } catch {
    return undefined
  }
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) {
    redirect("/auth/login")
  }

  const [{ data: user }, { data: settings }, rootData, subscription, itemCount, initialOwnerSharing] = await Promise.all([
    supabase.from("users").select("*").eq("id", authUser.id).single(),
    supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", authUser.id)
      .maybeSingle(),
    loadDashboardRootData(supabase, authUser.id),
    getSubscriptionStatus(supabase, authUser.id),
    getItemCount(supabase, authUser.id),
    loadOwnerSharing(authUser.id),
  ])

  const cap = await getEffectiveCap(supabase, authUser.id, subscription.isPro)

  const colorScheme = settings?.color_scheme as Theme | null | undefined
  const theme: Theme | null =
    colorScheme && typeof colorScheme === "object" ? { ...colorScheme } : null
  const graphOverlay = settings?.graph_overlay ?? true
  const demoPromptDismissed = settings?.dashboard_demo_prompt_dismissed ?? false

  return (
    <DashboardClient
      key={`${authUser.id}:${settings?.ai_tutorial_reset_at ?? "initial"}`}
      aiWidgetVisible={settings?.ai_widget_visible ?? true}
      tutorialResetAt={settings?.ai_tutorial_reset_at ?? null}
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
      initialDescendantCounts={rootData.descendantCounts}
      initialOwnerSharing={initialOwnerSharing}
    />
  )
}
