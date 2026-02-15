import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { Theme } from "@/lib/types"
import DashboardClient from "./dashboard-client"

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) {
    redirect("/auth/login")
  }

  const [{ data: user }, { data: settings }] = await Promise.all([
    supabase.from("users").select("*").eq("id", authUser.id).single(),
    supabase.from("user_settings").select("color_scheme, graph_overlay").eq("user_id", authUser.id).single(),
  ])

  const colorScheme = settings?.color_scheme as Theme | null | undefined
  const theme: Theme | null =
    colorScheme && typeof colorScheme === "object"
      ? {
          ...colorScheme,
          graphOverlay: settings?.graph_overlay ?? colorScheme.graphOverlay ?? true,
        }
      : null

  return <DashboardClient user={user} initialTheme={theme} />
}
