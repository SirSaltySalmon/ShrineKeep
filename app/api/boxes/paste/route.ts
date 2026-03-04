import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import type { BoxCopyPayload } from "@/lib/types"
import { createItems } from "@/lib/api/create-item"

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

async function pasteBoxTree(
  supabase: Supabase,
  userId: string,
  payload: BoxCopyPayload,
  targetParentBoxId: string | null,
  position: number
): Promise<string> {
  const { data: newBox, error } = await supabase
    .from("boxes")
    .insert({
      user_id: userId,
      parent_box_id: targetParentBoxId,
      name: payload.name.trim(),
      description: payload.description?.trim() || null,
      is_public: false,
      position,
    })
    .select("id")
    .single()

  if (error) throw error
  if (!newBox) throw new Error("Failed to create box")
  const newBoxId = newBox.id

  // Recursively create child boxes first
  for (let i = 0; i < payload.children.length; i++) {
    await pasteBoxTree(supabase, userId, payload.children[i], newBoxId, i)
  }

  // Batch create all items for this box
  if (payload.items.length > 0) {
    const items = payload.items.map((itemPayload) => {
      const thumbnailUrl =
        itemPayload.photos?.find((p) => p.is_thumbnail)?.url ?? itemPayload.thumbnail_url ?? null
      const acquisitionDate =
        itemPayload.acquisition_date ?? new Date().toISOString().split("T")[0]

      return {
        itemData: {
          name: itemPayload.name.trim(),
          description: itemPayload.description?.trim() || null,
          current_value: itemPayload.current_value ?? null,
          acquisition_date: acquisitionDate,
          acquisition_price: itemPayload.acquisition_price ?? null,
          expected_price: null,
          thumbnail_url: thumbnailUrl,
          box_id: newBoxId,
          user_id: userId,
          is_wishlist: false,
        },
        photos: itemPayload.photos,
        tagIds: itemPayload.tag_ids,
        valueHistory: itemPayload.value_history,
        currentValue: itemPayload.current_value,
      }
    })

    await createItems({
      supabase,
      userId,
      items,
    })
  }

  return newBoxId
}

/**
 * Paste one or more box trees under targetParentBoxId. Body: { trees: BoxCopyPayload[], targetParentBoxId: string | null }.
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
      trees?: BoxCopyPayload[]
      targetParentBoxId?: string | null
    }
    const trees = body.trees ?? []
    const targetParentBoxId = body.targetParentBoxId ?? null

    if (trees.length === 0) {
      return NextResponse.json(
        { error: "trees array is required" },
        { status: 400 }
      )
    }

    const createdBoxIds: string[] = []
    for (let i = 0; i < trees.length; i++) {
      const id = await pasteBoxTree(supabase, user.id, trees[i], targetParentBoxId, i)
      createdBoxIds.push(id)
    }

    return NextResponse.json({ success: true, createdBoxIds })
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to paste box tree"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
