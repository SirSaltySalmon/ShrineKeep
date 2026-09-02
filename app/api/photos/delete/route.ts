import { createSupabaseServerClient } from "@/lib/supabase/server"
import { requireMutableUser } from "@/lib/judge/require-mutable-user"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { deletePhotoRowsAndUnreferencedStorage } from "@/lib/api/photo-storage"

/**
 * Delete a single photo from database and storage.
 * This endpoint:
 * 1. Verifies the photo exists and belongs to an item owned by the user
 * 2. Deletes the blob from the bucket only if no other photo row still
 *    references that storage_path (shared refs after copy/paste)
 * 3. Deletes the photo record from the database
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireMutableUser()
    if (!session.ok) return session.response
    const { supabase, user } = session

    const { photoId } = (await request.json()) as { photoId: string }

    if (!photoId) {
      return NextResponse.json({ error: "photoId is required" }, { status: 400 })
    }

    const { data: photo, error: photoError } = await supabase
      .from("photos")
      .select("id, storage_path, item_id, items!inner(id, user_id)")
      .eq("id", photoId)
      .single()

    if (photoError || !photo) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 })
    }

    const joined = (photo as { items?: { id: string; user_id: string } | { id: string; user_id: string }[] | null })
      .items
    const item = Array.isArray(joined) ? joined[0] ?? null : joined ?? null
    if (!item || item.user_id !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    const result = await deletePhotoRowsAndUnreferencedStorage(supabase, user.id, [
      { id: photo.id, storage_path: photo.storage_path ?? null },
    ])

    return NextResponse.json({
      success: true,
      deletedFromStorage: result.deletedFromStorage > 0,
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
