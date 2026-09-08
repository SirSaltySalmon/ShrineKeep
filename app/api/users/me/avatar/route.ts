import { createSupabaseServiceClient } from "@/lib/supabase/service"
import { requireMutableUser } from "@/lib/judge/require-mutable-user"
import { NextResponse } from "next/server"

/**
 * DELETE /api/users/me/avatar
 * Clears the public avatar URL and detaches avatar_asset_id so GC collects the blob.
 */
export async function DELETE() {
  try {
    const session = await requireMutableUser()
    if (!session.ok) return session.response
    const { supabase, user: authUser } = session
    const service = createSupabaseServiceClient()

    const { error: profileError } = await service
      .from("public_profiles")
      .update({ avatar_asset_id: null, updated_at: new Date().toISOString() })
      .eq("user_id", authUser.id)
    if (profileError) {
      console.error("Error detaching avatar asset:", profileError)
    }

    await supabase
      .from("users")
      .update({ avatar_url: null, updated_at: new Date().toISOString() })
      .eq("id", authUser.id)

    return NextResponse.json({ success: true, deletedFromStorage: false })
  } catch (error) {
    console.error("Error removing avatar:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to remove avatar" },
      { status: 500 }
    )
  }
}
