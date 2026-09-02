import { createSupabaseServerClient } from "@/lib/supabase/server"
import { requireMutableUser } from "@/lib/judge/require-mutable-user"
import { NextResponse } from "next/server"
import { setDashboardDemoPromptDismissed } from "@/lib/demo/set-demo-prompt-dismissed"

export async function POST() {
  try {
    const session = await requireMutableUser()
    if (!session.ok) return session.response
    const { supabase, user } = session

    await setDashboardDemoPromptDismissed(supabase, user.id)
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to update settings"
    console.error("demo prompt dismiss:", error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
