import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createBoxes } from "@/lib/api/create-box"

interface BoxCreateRequest {
  name: string
  description?: string | null
  parent_box_id?: string | null
  position?: number
}

interface BoxesBatchCreateRequest {
  boxes: Array<{
    name: string
    description?: string | null
    parent_box_id?: string | null
    position?: number
  }>
}

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

    // Check if it's a batch request
    if ("boxes" in body && Array.isArray(body.boxes)) {
      // Batch creation
      if (body.boxes.length === 0) {
        return NextResponse.json({ error: "boxes array must not be empty" }, { status: 400 })
      }

      // Validate required fields
      for (const box of body.boxes) {
        if (!box.name || !box.name.trim()) {
          return NextResponse.json(
            { error: "Name is required for all boxes" },
            { status: 400 }
          )
        }
      }

      const boxIds = await createBoxes(supabase, user.id, body.boxes)
      return NextResponse.json({ success: true, boxIds })
    } else {
      // Single box creation
      const { name, description, parent_box_id, position } = body as BoxCreateRequest

      if (!name || !name.trim()) {
        return NextResponse.json({ error: "Name is required" }, { status: 400 })
      }

      const boxIds = await createBoxes(supabase, user.id, [
        {
          name,
          description,
          parent_box_id,
          position,
        },
      ])
      return NextResponse.json({ success: true, boxId: boxIds[0] })
    }
  } catch (error: unknown) {
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
