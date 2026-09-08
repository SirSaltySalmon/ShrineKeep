import { notFound, redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { redirectIfSandboxRowExpired } from "@/lib/judge/redirect-if-expired"
import { publicNickname } from "@/lib/sharing/identity"
import AppNav from "@/components/app-nav"

export default async function SocialLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (process.env.SOCIAL_MUTATIONS_ENABLED !== "true") {
    notFound()
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) {
    redirect("/auth/login")
  }

  const { data: user } = await supabase
    .from("users")
    .select("name, is_sandbox, sandbox_expires_at")
    .eq("id", authUser.id)
    .single()

  redirectIfSandboxRowExpired(user)

  const displayName = publicNickname(authUser.id, user?.name ?? null)

  return (
    <div className="min-h-screen bg-background">
      <AppNav name={displayName} sandbox={user?.is_sandbox === true} />
      {children}
    </div>
  )
}
