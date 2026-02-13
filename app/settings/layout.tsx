import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import AppNav from "@/components/app-nav"

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) {
    redirect("/auth/login")
  }

  const { data: user } = await supabase
    .from("users")
    .select("name, username")
    .eq("id", authUser.id)
    .single()

  const displayName =
    (user?.name && user.name.trim() !== "" ? user.name : null) ??
    (authUser.user_metadata?.name as string | undefined) ??
    (authUser.user_metadata?.full_name as string | undefined) ??
    user?.username ??
    authUser.email ??
    null

  return (
    <div className="min-h-screen bg-background">
      <AppNav name={displayName} />
      {children}
    </div>
  )
}
