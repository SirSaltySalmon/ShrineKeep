import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase/server"
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

  return (
    <WishlistClient
      aiWidgetVisible={settings?.ai_widget_visible ?? true}
      userId={user.id}
      initialWishlistIsPublic={settings?.wishlist_is_public ?? false}
      initialWishlistShareToken={settings?.wishlist_share_token ?? null}
      initialWishlistApplyColors={settings?.wishlist_apply_colors ?? false}
    />
  )
}
