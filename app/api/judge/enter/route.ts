import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import {
  classifyAuthUser,
  deleteOneExpiredSandboxAuthUser,
  enqueueThenDeleteAuthUser,
} from "@/lib/judge/sandbox"
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

    if (kind === "user") {
      return NextResponse.json(
        { error: "You're already signed in.", code: "already_signed_in" },
        { status: 409 }
      )
    }
    if (kind === "sandbox") {
      return NextResponse.json({ ok: true, resumed: true })
    }

    const previousExpiredId = kind === "expired" && user ? user.id : null
    const json = await mintSandboxSession(request, captchaToken)
    if (previousExpiredId) {
      try {
        await enqueueThenDeleteAuthUser(previousExpiredId)
      } catch (error) {
        console.error("judge enter delete expired:", error)
      }
    } else {
      try {
        await deleteOneExpiredSandboxAuthUser()
      } catch (error) {
        console.error("judge enter lazy sweep:", error)
      }
    }
    return json
  } catch (error) {
    console.error("judge enter:", error)
    return NextResponse.json({ error: "Could not start sandbox. Try again." }, { status: 500 })
  }
}
