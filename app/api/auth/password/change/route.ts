import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_LENGTH_MESSAGE,
} from "@/lib/validation"

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : null
    const newPassword = typeof body?.newPassword === "string" ? body.newPassword : null
    const captchaToken = typeof body?.captchaToken === "string" ? body.captchaToken : null

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Current password and new password are required." },
        { status: 400 }
      )
    }

    if (
      newPassword.length < PASSWORD_MIN_LENGTH ||
      newPassword.length > PASSWORD_MAX_LENGTH
    ) {
      return NextResponse.json(
        { error: PASSWORD_LENGTH_MESSAGE },
        { status: 400 }
      )
    }

    if (!captchaToken) {
      return NextResponse.json(
        { error: "Please complete the captcha verification." },
        { status: 400 }
      )
    }

    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user?.email) {
      return NextResponse.json(
        { error: "You must be signed in with an email account to change your password." },
        { status: 401 }
      )
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
      options: { captchaToken },
    })

    if (signInError) {
      return NextResponse.json(
        { error: signInError.message },
        { status: 400 }
      )
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 400 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Something went wrong. Please try again."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
