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
    .select("name, username")
    .eq("id", session.user.id)
    .single()

  const storedName = user?.name?.trim()
  const isDefaultName = storedName && /^user_[a-f0-9]{8}$/i.test(storedName)
  const fromSession =
    (session.user.user_metadata?.name as string | undefined) ??
    (session.user.user_metadata?.full_name as string | undefined)
  const displayName =
    (storedName && !isDefaultName ? storedName : null) ??
    (fromSession && fromSession.trim() !== "" ? fromSession : null) ??
    (isDefaultName ? storedName : null) ??
    user?.username ??
    session.user.email ??
    null

  return (
    <div className="min-h-screen bg-background">
      <AppNav name={displayName} />
      {children}
    </div>
  )
}
