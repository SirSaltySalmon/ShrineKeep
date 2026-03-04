import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { moveBoxes } from "@/lib/api/move-box"

/**
 * Move one or more boxes to a target parent box.
 * Body: { boxId, targetParentBoxId } or { boxIds: string[], targetParentBoxId }.
 * Uses optimized batch movement for multiple boxes.
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

    const body = (await request.json()) as {
      boxId?: string
      boxIds?: string[]
      targetParentBoxId?: string | null
    }
    const targetParentBoxId = body.targetParentBoxId ?? null
    const boxIds = body.boxIds ?? (body.boxId ? [body.boxId] : null)

    if (!boxIds || boxIds.length === 0) {
      return NextResponse.json(
        { error: "boxId or boxIds array is required" },
        { status: 400 }
      )
    }

    const { movedCount } = await moveBoxes(supabase, user.id, boxIds, targetParentBoxId)
    return NextResponse.json({ success: true, movedCount })
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : "Failed to move box"

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
