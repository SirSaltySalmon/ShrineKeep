import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export type ResendEmailResponse =
  | { ok: true }
  | { ok: false; code: "rate_limited"; message: string }
  | { ok: false; code: "failed"; message: string }
  | { ok: false; code: "missing_email"; message: string }

function isRateLimitError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes("rate limit") ||
    lower.includes("rate_limit") ||
    lower.includes("email rate limit") ||
    lower.includes("per hour") ||
    lower.includes("per minute") ||
    lower.includes("60 second") ||
    lower.includes("too many")
  )
}

export async function POST(request: Request): Promise<NextResponse<ResendEmailResponse>> {
  try {
    const body = await request.json().catch(() => ({}))
    const emailFromBody = typeof body?.email === "string" ? body.email.trim() : null

    const supabase = await createSupabaseServerClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    const email = emailFromBody || session?.user?.email || null

    if (!email) {
      return NextResponse.json(
        {
          ok: false,
          code: "missing_email",
          message: "Email is required. Sign up and provide your email.",
        },
        { status: 400 }
      )
    }

    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
    })

    if (error) {
      const msg = error.message
      if (isRateLimitError(msg)) {
        return NextResponse.json(
          {
            ok: false,
            code: "rate_limited",
            message:
              "Please wait before requesting another email. You can request a new link once per minute.",
          },
          { status: 429 }
        )
      }
      return NextResponse.json(
        {
          ok: false,
          code: "failed",
          message: msg,
        },
        { status: 400 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to resend email."
    return NextResponse.json(
      { ok: false, code: "failed", message },
      { status: 500 }
    )
  }
}
