import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import DashboardClient from "./dashboard-client"

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) {
    redirect("/auth/login")
  }

  const { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("id", authUser.id)
    .single()

  return <DashboardClient user={user} />
}
