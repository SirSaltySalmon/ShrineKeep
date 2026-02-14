import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

const AVATARS_BUCKET = "avatars"

/**
 * DELETE /api/users/me/avatar
 * Removes the current user's avatar: deletes from storage (if in our bucket and path belongs to user)
 * and sets public.users.avatar_url to null.
 * Caller must be authenticated; only the avatar for the current user can be removed.
 */
export async function DELETE() {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser()

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("avatar_url")
      .eq("id", authUser.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    const avatarUrl = profile.avatar_url
    if (!avatarUrl || typeof avatarUrl !== "string") {
      await supabase
        .from("users")
        .update({ avatar_url: null, updated_at: new Date().toISOString() })
        .eq("id", authUser.id)
      return NextResponse.json({ success: true, deletedFromStorage: false })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
    }

    const prefix = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${AVATARS_BUCKET}/`
    let storagePath: string | null = null
    if (avatarUrl.startsWith(prefix)) {
      storagePath = avatarUrl.slice(prefix.length)
    }

    let deletedFromStorage = false
    if (storagePath) {
      const pathSegments = storagePath.split("/")
      const pathUserId = pathSegments[0]
      if (pathUserId === authUser.id) {
        const { error: storageError } = await supabase.storage
          .from(AVATARS_BUCKET)
          .remove([storagePath])
        if (!storageError) deletedFromStorage = true
        if (storageError) {
          console.error("Error deleting avatar from storage:", storageError)
        }
      }
    }

    await supabase
      .from("users")
      .update({ avatar_url: null, updated_at: new Date().toISOString() })
      .eq("id", authUser.id)

    return NextResponse.json({ success: true, deletedFromStorage })
  } catch (error) {
    console.error("Error removing avatar:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to remove avatar" },
      { status: 500 }
    )
  }
}
