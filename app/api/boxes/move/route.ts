import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { boxId, targetParentBoxId } = await request.json()

    if (!boxId) {
      return NextResponse.json({ error: "boxId required" }, { status: 400 })
    }

    // Cannot make a box its own parent
    if (targetParentBoxId !== null && targetParentBoxId === boxId) {
      return NextResponse.json(
        { error: "A box cannot be moved into itself" },
        { status: 400 }
      )
    }

    // Prevent cycle: target must not be the moved box or a descendant of it
    if (targetParentBoxId) {
      let ancestorId: string | null = targetParentBoxId
      while (ancestorId) {
        if (ancestorId === boxId) {
          return NextResponse.json(
            { error: "Cannot move a box into its own descendant" },
            { status: 400 }
          )
        }
        const { data: parent } = await supabase
          .from("boxes")
          .select("parent_box_id")
          .eq("id", ancestorId)
          .eq("user_id", session.user.id)
          .single()
        ancestorId = parent?.parent_box_id ?? null
      }
    }

    const { error } = await supabase
      .from("boxes")
      .update({ parent_box_id: targetParentBoxId || null })
      .eq("id", boxId)
      .eq("user_id", session.user.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to move box"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
