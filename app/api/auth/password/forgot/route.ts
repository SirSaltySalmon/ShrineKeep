import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { type AuthEmailResponse, isRateLimitError } from "@/lib/auth-utils"
import { captureRouteException } from "@/lib/monitoring/sentry"
import { createSupabaseServiceClient } from "@/lib/supabase/service"
import { assertNotSandbox } from "@/lib/judge/sandbox"

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
    const {
      data: { user: signedIn },
    } = await supabase.auth.getUser()
    if (signedIn) {
      const sandbox = await assertNotSandbox(supabase, signedIn.id)
      if (!sandbox.ok) {
        return NextResponse.json(
          { ok: false, code: "forbidden", message: sandbox.error },
          { status: sandbox.status }
        )
      }
    } else {
      const service = createSupabaseServiceClient()
      const { data: profile } = await service
        .from("users")
        .select("id, is_sandbox")
        .eq("email", email)
        .maybeSingle()
      if (profile?.is_sandbox) {
        return NextResponse.json(
          { ok: false, code: "forbidden", message: "Not available on a temporary sandbox account." },
          { status: 403 }
        )
      }
    }
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
    captureRouteException(e, {
      area: "auth",
      route: "/api/auth/password/forgot",
      tags: {
        operation: "forgot_password",
      },
    })
    return NextResponse.json(
      { ok: false, code: "failed", message },
      { status: 500 }
    )
  }
}
