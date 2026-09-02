import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { classifyAuthUser, enqueueThenDeleteAuthUser } from "@/lib/judge/sandbox"
import { mintSandboxSession } from "@/lib/judge/mint"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { captchaToken?: unknown }
    const captchaToken = typeof body.captchaToken === "string" ? body.captchaToken : ""
    if (!captchaToken) {
      return NextResponse.json({ error: "Please complete the captcha verification." }, { status: 400 })
    }

    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const kind = await classifyAuthUser(supabase, user)
    if (kind !== "sandbox" || !user) {
      return NextResponse.json({ error: "No live sandbox to replace." }, { status: 409 })
    }
    const previousId = user.id

    const json = await mintSandboxSession(request, captchaToken)
    try {
      await enqueueThenDeleteAuthUser(previousId)
    } catch (error) {
      console.error("judge restart delete previous:", error)
    }
    return json
  } catch (error) {
    console.error("judge restart:", error)
    return NextResponse.json({ error: "Could not start sandbox. Try again." }, { status: 500 })
  }
}
