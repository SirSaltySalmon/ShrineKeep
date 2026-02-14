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

  const [{ data: user }, { data: settings }] = await Promise.all([
    supabase.from("users").select("name, username").eq("id", authUser.id).single(),
    supabase.from("user_settings").select("use_custom_display_name").eq("user_id", authUser.id).single(),
  ])

  const providerName =
    (authUser.user_metadata?.name as string | undefined) ??
    (authUser.user_metadata?.full_name as string | undefined) ??
    null
  const customName =
    user?.name && user.name.trim() !== "" ? user.name : null
  const useCustom = settings?.use_custom_display_name ?? true

  const displayName = useCustom
    ? (customName ?? providerName ?? user?.username ?? authUser.email ?? null)
    : (providerName ?? user?.username ?? authUser.email ?? null)

  return (
    <div className="min-h-screen bg-background">
      <AppNav name={displayName} />
      {children}
    </div>
  )
}
