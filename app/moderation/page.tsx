import type { Metadata } from "next"
import Link from "next/link"
import { ModerationClient } from "./moderation-client"
import {
  isAllowedModeratorEmail,
  moderatorsConfigured,
} from "@/lib/moderation/moderators"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Moderation",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function ModerationPage() {
  if (!moderatorsConfigured()) {
    return (
      <div className="bg-background flex min-h-screen flex-col items-center justify-center gap-4 p-6">
        <p className="text-muted-foreground text-sm">
          Moderation is not configured. Set <code className="text-foreground">MODERATOR_EMAILS</code>{" "}
          on the server.
        </p>
      </div>
    )
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !isAllowedModeratorEmail(user.email)) {
    return (
      <div className="bg-background flex min-h-screen flex-col items-center justify-center gap-4 p-6">
        <p className="text-muted-foreground text-sm">Unauthorized.</p>
        <Link
          href="/auth/login?next=/moderation"
          className="text-primary text-sm underline underline-offset-4 hover:no-underline"
        >
          Sign in
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted/30 p-6 md:p-10">
      <ModerationClient />
    </div>
  )
}
