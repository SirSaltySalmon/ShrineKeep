import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { deleteItemsForUser, type DeleteItemsRequestBody } from "@/lib/services/items/delete-items"

/**
 * Delete one or more items. Only deletes a photo file from storage when
 * no other item's photo references that path (shared refs after copy/paste).
 * Body: { itemId: string } or { itemIds: string[] } for bulk.
 * Uses optimized batch deletion for multiple items.
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

    const body = (await request.json()) as DeleteItemsRequestBody
    const { deletedPhotos, deletedCount } = await deleteItemsForUser(supabase, user.id, body)
    return NextResponse.json({
      success: true,
      deletedPhotos,
      deletedCount,
    })
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.message === "itemId or itemIds array is required"
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
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
