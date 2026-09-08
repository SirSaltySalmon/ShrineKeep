import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import SocialClient from "./social-client"

export default async function SocialPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) {
    redirect("/auth/login")
  }

  const { data: user } = await supabase
    .from("users")
    .select("is_sandbox")
    .eq("id", authUser.id)
    .single()

  return <SocialClient sandbox={user?.is_sandbox === true} />
}
