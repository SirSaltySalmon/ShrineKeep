import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase/service"
import { createSharingMutationCore } from "@/lib/sharing/server/mutation-core"
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

  if (settings && process.env.SOCIAL_SHARING_EDITS_ENABLED === "true") {
    try {
      const service = createSupabaseServiceClient()
      const core = createSharingMutationCore((name, args) => service.rpc(name, args))
      const sharing = await core.readOwnerSettings(authUser.id)
      if (sharing.ok) {
        settings = {
          ...settings,
          public_nickname: sharing.data.nickname,
          public_bio: sharing.data.bio,
          profile_share_style: sharing.data.profileShareStyle,
          root_collection_visibility: sharing.data.root.collectionVisibility,
          root_share_financials: sharing.data.root.shareFinancials,
          root_wishlist_visibility: sharing.data.root.wishlistVisibility,
          wishlist_link_enabled: sharing.data.wishlistLinkEnabled,
          wishlist_share_token: sharing.data.wishlistShareToken,
          sharing_revision: sharing.data.revision,
          wishlist_guest_visible_count: sharing.data.wishlistGuestVisibleCount,
          wishlist_guest_total_count: sharing.data.wishlistGuestTotalCount,
        }
      }
    } catch {
      // Settings still render; public fields stay unset until the client save path.
    }
  }

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
