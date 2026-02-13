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

  return <WishlistClient />
}
