import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { type AuthEmailResponse, isRateLimitError } from "@/lib/auth-utils"

export async function POST(request: Request): Promise<NextResponse<AuthEmailResponse>> {
  try {
    const body = await request.json().catch(() => ({}))
    const email = typeof body?.email === "string" ? body.email.trim() : null
    const captchaToken = typeof body?.captchaToken === "string" ? body.captchaToken : null

    if (!email) {
      return NextResponse.json(
        {
          ok: false,
          code: "missing_email",
          message: "Please enter your email address.",
        },
        { status: 400 }
      )
    }

    const supabase = await createSupabaseServerClient()
    const origin =
      request.headers.get("origin") ??
      (typeof request.url === "string" ? new URL(request.url).origin : "")
    const redirectTo = `${origin}/auth/reset-password`
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
      captchaToken: captchaToken ?? undefined,
    })

    if (error) {
      const msg = error.message
      if (isRateLimitError(msg)) {
        return NextResponse.json(
          {
            ok: false,
            code: "rate_limited",
            message:
              "Too many attempts. Please wait before requesting another reset email (about one per minute).",
          },
          { status: 429 }
        )
      }
      return NextResponse.json(
        { ok: false, code: "failed", message: msg },
        { status: 400 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Something went wrong. Please try again."
    return NextResponse.json(
      { ok: false, code: "failed", message },
      { status: 500 }
    )
  }
}
