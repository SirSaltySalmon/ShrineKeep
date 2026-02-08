import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import AppNav from "@/components/app-nav"

export default async function WishlistLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    redirect("/auth/login")
  }

  const { data: user } = await supabase
    .from("users")
    .select("username")
    .eq("id", session.user.id)
    .single()

  return (
    <div className="min-h-screen bg-background">
      <AppNav username={user?.username ?? session.user.email ?? null} />
      {children}
    </div>
  )
}
