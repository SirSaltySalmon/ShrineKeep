import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import WishlistClient from "./wishlist-client"

export default async function WishlistPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    redirect("/auth/login")
  }

  return <WishlistClient />
}
