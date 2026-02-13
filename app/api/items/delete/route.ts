import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/**
 * Delete an item and all associated photos from storage.
 * This endpoint:
 * 1. Fetches all photos associated with the item
 * 2. Deletes photos from storage bucket
 * 3. Deletes the item from database (CASCADE will delete photos, value_history, item_tags)
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

    const { itemId } = await request.json() as { itemId: string }

    if (!itemId) {
      return NextResponse.json({ error: "itemId is required" }, { status: 400 })
    }

    // First, verify the item exists and belongs to the user
    const { data: item, error: itemError } = await supabase
      .from("items")
      .select("id, user_id")
      .eq("id", itemId)
      .eq("user_id", user.id)
      .single()

    if (itemError || !item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 })
    }

    // Fetch all photos associated with this item to get storage paths
    const { data: photos, error: photosError } = await supabase
      .from("photos")
      .select("storage_path")
      .eq("item_id", itemId)

    if (photosError) {
      console.error("Error fetching photos:", photosError)
      // Continue with deletion even if photo fetch fails
    }

    // Delete photos from storage if they exist
    const storagePathsToDelete = photos
      ?.map((p) => p.storage_path)
      .filter((path): path is string => path !== null && path !== undefined) || []

    if (storagePathsToDelete.length > 0) {
      // Validate paths belong to user (security check)
      const userId = user.id
      const validPaths = storagePathsToDelete.filter((path) => {
        const pathParts = path.split("/")
        return pathParts.length >= 2 && pathParts[0] === userId
      })

      if (validPaths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from("item-photos")
          .remove(validPaths)

        if (storageError) {
          console.error("Error deleting photos from storage:", storageError)
          // Continue with item deletion even if storage deletion fails
          // (orphaned files can be cleaned up later)
        }
      }
    }

    // Delete the item (CASCADE will automatically delete photos, value_history, item_tags)
    const { error: deleteError } = await supabase
      .from("items")
      .delete()
      .eq("id", itemId)
      .eq("user_id", user.id)

    if (deleteError) {
      throw deleteError
    }

    return NextResponse.json({ success: true, deletedPhotos: storagePathsToDelete.length })
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
