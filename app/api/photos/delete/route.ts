import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/**
 * Delete a single photo from database and storage.
 * This endpoint:
 * 1. Verifies the photo exists and belongs to an item owned by the user
 * 2. Deletes the photo from storage bucket (if storage_path exists)
 * 3. Deletes the photo record from database
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

    const { photoId } = await request.json() as { photoId: string }

    if (!photoId) {
      return NextResponse.json({ error: "photoId is required" }, { status: 400 })
    }

    // Fetch the photo and verify ownership through the item
    const { data: photo, error: photoError } = await supabase
      .from("photos")
      .select("id, storage_path, item_id, items!inner(id, user_id)")
      .eq("id", photoId)
      .single()

    if (photoError || !photo) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 })
    }

    // Verify the item belongs to the user
    const item = (photo as any).items as { id: string; user_id: string } | null
    if (!item || item.user_id !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    // Delete from storage if storage_path exists
    if (photo.storage_path) {
      // Validate path belongs to user (security check)
      const userId = user.id
      const pathParts = photo.storage_path.split("/")
      const isValidPath = pathParts.length >= 2 && pathParts[0] === userId

      if (isValidPath) {
        const { error: storageError } = await supabase.storage
          .from("item-photos")
          .remove([photo.storage_path])

        if (storageError) {
          console.error("Error deleting photo from storage:", storageError)
          // Continue with database deletion even if storage deletion fails
        }
      }
    }

    // Delete the photo record from database
    const { error: deleteError } = await supabase
      .from("photos")
      .delete()
      .eq("id", photoId)

    if (deleteError) {
      throw deleteError
    }

    return NextResponse.json({ 
      success: true, 
      deletedFromStorage: !!photo.storage_path 
    })
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : "Failed to delete photo"

    console.error("Error deleting photo:", message, error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
