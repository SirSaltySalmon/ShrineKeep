import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { setDashboardDemoPromptDismissed } from "@/lib/demo/set-demo-prompt-dismissed"

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await setDashboardDemoPromptDismissed(supabase, user.id)
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to update settings"
    console.error("demo prompt dismiss:", error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
