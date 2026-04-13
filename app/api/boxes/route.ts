import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import {
  createBoxesForUser,
  type BoxCreateRequest,
  type BoxesBatchCreateRequest,
} from "@/lib/services/boxes/create-boxes"

/**
 * Create one or more boxes. Body: { name, description?, parent_box_id?, position? } or { boxes: [...] }.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = (await request.json()) as BoxCreateRequest | BoxesBatchCreateRequest

    const { boxIds, isBatch } = await createBoxesForUser(supabase, user.id, body)
    if (isBatch) {
      return NextResponse.json({ success: true, boxIds })
    }
    return NextResponse.json({ success: true, boxId: boxIds[0] })
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error.message === "boxes array must not be empty" ||
        error.message === "Name is required for all boxes" ||
        error.message === "Name is required")
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : "Failed to create box"

    console.error("Error creating box:", message, error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
