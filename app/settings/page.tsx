import { createSupabaseServerClient } from "@/lib/supabase/server"
import SettingsClient from "./settings-client"

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null // Layout will handle redirect
  }

  // Fetch user settings
  const { data: settings } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .single()

  return <SettingsClient initialSettings={settings} />
}
