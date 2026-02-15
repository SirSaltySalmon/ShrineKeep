import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { Theme } from "@/lib/types"
import SettingsClient from "./settings-client"

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) {
    return null // Layout will handle redirect
  }

  const [settingsResult, profileResult] = await Promise.all([
    supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", authUser.id)
      .single(),
    supabase
      .from("users")
      .select("name, username, avatar_url")
      .eq("id", authUser.id)
      .single(),
  ])

  let settings = settingsResult.data
  const colorScheme = settings?.color_scheme as Theme | null | undefined
  if (settings && colorScheme && typeof colorScheme === "object") {
    settings = {
      ...settings,
      color_scheme: {
        ...colorScheme,
        radius: settings.border_radius ?? colorScheme.radius ?? "0.5rem",
      },
    }
  }
  const profile = profileResult.data
  const provider =
    (authUser.app_metadata?.provider as string) ??
    authUser.identities?.[0]?.provider ??
    "email"
  const isEmailProvider = provider === "email"
  const providerName =
    (authUser.user_metadata?.name as string) ||
    (authUser.user_metadata?.full_name as string) ||
    null
  const providerAvatarUrl = (authUser.user_metadata?.avatar_url as string) || null
  const avatarUrl = profile?.avatar_url ?? providerAvatarUrl ?? null

  return (
    <SettingsClient
      initialSettings={settings}
      initialProfile={{
        displayName: profile?.name ?? "",
        useCustomDisplayName: isEmailProvider ? true : (settings?.use_custom_display_name ?? true),
        providerName,
        email: authUser.email ?? "",
        isEmailProvider,
        avatarUrl,
        userId: authUser.id,
      }}
    />
  )
}
