import { NextResponse } from "next/server"
import {
  NAME_MAX_LENGTH,
  NAME_MAX_MESSAGE,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_LENGTH_MESSAGE,
} from "@/lib/validation"

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const name = typeof body?.name === "string" ? body.name.trim() : ""
    const password = typeof body?.password === "string" ? body.password : ""

    if (name.length > NAME_MAX_LENGTH) {
      return NextResponse.json(
        { ok: false, error: NAME_MAX_MESSAGE },
        { status: 400 }
      )
    }

    if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
      return NextResponse.json(
        { ok: false, error: PASSWORD_LENGTH_MESSAGE },
        { status: 400 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json(
      { ok: false, error: "Validation failed." },
      { status: 500 }
    )
  }
}
