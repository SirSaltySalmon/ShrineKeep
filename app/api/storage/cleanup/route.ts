import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/**
 * Cleanup endpoint for deleting unsaved uploaded files from storage.
 * Validates that the user owns the files before deletion.
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

    const { storage_paths } = await request.json() as { storage_paths: string[] }

    if (!storage_paths || !Array.isArray(storage_paths) || storage_paths.length === 0) {
      return NextResponse.json({ error: "storage_paths array is required" }, { status: 400 })
    }

    // Validate that all paths belong to the current user
    // Path format: {user_id}/items/{filename}
    const userId = user.id
    const validPaths = storage_paths.filter((path) => {
      if (!path || typeof path !== "string") return false
      const pathParts = path.split("/")
      return pathParts.length >= 2 && pathParts[0] === userId
    })

    if (validPaths.length === 0) {
      return NextResponse.json({ error: "No valid storage paths provided" }, { status: 400 })
    }

    // Delete files from storage
    const { error, data } = await supabase.storage
      .from("item-photos")
      .remove(validPaths)

    if (error) {
      console.error("Error deleting files from storage:", error)
      return NextResponse.json({ error: "Failed to delete files" }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      deleted: validPaths.length,
      failed: storage_paths.length - validPaths.length 
    })
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : "Failed to cleanup storage"

    console.error("Error cleaning up storage:", message, error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
