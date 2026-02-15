import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { deleteItemWithPhotoRefCheck } from "@/lib/api/delete-item"

/**
 * Delete one or more items. Only deletes a photo file from storage when
 * no other item's photo references that path (shared refs after copy/paste).
 * Body: { itemId: string } or { itemIds: string[] } for bulk.
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

    const body = (await request.json()) as { itemId?: string; itemIds?: string[] }
    const itemIds = body.itemIds ?? (body.itemId ? [body.itemId] : null)

    if (!itemIds || itemIds.length === 0) {
      return NextResponse.json(
        { error: "itemId or itemIds array is required" },
        { status: 400 }
      )
    }

    let totalDeletedPhotos = 0
    for (const itemId of itemIds) {
      const { deletedPhotos } = await deleteItemWithPhotoRefCheck(
        supabase,
        user.id,
        itemId
      )
      totalDeletedPhotos += deletedPhotos
    }

    return NextResponse.json({
      success: true,
      deletedPhotos: totalDeletedPhotos,
      deletedCount: itemIds.length,
    })
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : "Failed to delete item"

    console.error("Error deleting item:", message, error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
