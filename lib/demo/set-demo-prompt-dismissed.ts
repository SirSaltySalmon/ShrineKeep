import type { createSupabaseServerClient } from "@/lib/supabase/server"

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

export async function setDashboardDemoPromptDismissed(
  supabase: Supabase,
  userId: string
): Promise<void> {
  const { data: row } = await supabase
    .from("user_settings")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle()

  if (row) {
    const { error } = await supabase
      .from("user_settings")
      .update({ dashboard_demo_prompt_dismissed: true })
      .eq("user_id", userId)
    if (error) throw error
  } else {
    const { error } = await supabase.from("user_settings").insert({
      user_id: userId,
      dashboard_demo_prompt_dismissed: true,
    })
    if (error) throw error
  }
}
