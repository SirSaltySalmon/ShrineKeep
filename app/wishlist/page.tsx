import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase/service"
import { createSharingMutationCore } from "@/lib/sharing/server/mutation-core"
import { PRIVATE_SHARING_DEFAULTS } from "@/lib/sharing/contracts"
import WishlistClient from "./wishlist-client"

export default async function WishlistPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const { data: settings } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle()

  let sharing = {
    wishlistLinkEnabled: Boolean(settings?.wishlist_link_enabled),
    wishlistShareToken: settings?.wishlist_share_token ?? null,
    revision: "0",
    nickname: null as string | null,
    bio: "",
    profileShareStyle: Boolean(settings?.profile_share_style),
    root: {
      collectionVisibility: settings?.root_collection_visibility ?? PRIVATE_SHARING_DEFAULTS.collectionVisibility,
      shareFinancials: Boolean(settings?.root_share_financials),
      wishlistVisibility: settings?.root_wishlist_visibility ?? PRIVATE_SHARING_DEFAULTS.wishlistVisibility,
    },
    visibleCount: 0,
    totalCount: 0,
  }

  if (process.env.SOCIAL_SHARING_EDITS_ENABLED === "true") {
    try {
      const service = createSupabaseServiceClient()
      const core = createSharingMutationCore((name, args) => service.rpc(name, args))
      const result = await core.readOwnerSettings(user.id)
      if (result.ok) {
        sharing = {
          wishlistLinkEnabled: result.data.wishlistLinkEnabled,
          wishlistShareToken: result.data.wishlistShareToken,
          revision: result.data.revision,
          nickname: result.data.nickname,
          bio: result.data.bio,
          profileShareStyle: result.data.profileShareStyle,
          root: result.data.root,
          visibleCount: result.data.wishlistGuestVisibleCount,
          totalCount: result.data.wishlistGuestTotalCount,
        }
      }
    } catch {
      // Fall back to the settings row.
    }
  }

  return (
    <WishlistClient
      aiWidgetVisible={settings?.ai_widget_visible ?? true}
      userId={user.id}
      initialWishlistLinkEnabled={sharing.wishlistLinkEnabled}
      initialWishlistShareToken={sharing.wishlistShareToken}
      initialWishlistApplyColors={settings?.wishlist_apply_colors ?? false}
      initialRoot={sharing.root}
      initialNickname={sharing.nickname}
      initialBio={sharing.bio}
      initialProfileShareStyle={sharing.profileShareStyle}
      initialSharingRevision={sharing.revision}
      initialVisibleCount={sharing.visibleCount}
      initialTotalCount={sharing.totalCount}
    />
  )
}
