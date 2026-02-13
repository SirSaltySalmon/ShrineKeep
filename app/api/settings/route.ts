import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { generateShareToken } from "@/lib/settings"
import { ColorScheme } from "@/lib/types"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: settings, error } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .single()

    if (error && error.code !== "PGRST116") {
      // PGRST116 is "not found" - that's okay, we'll return defaults
      throw error
    }

    if (!settings) {
      // Return defaults if no settings exist
      return NextResponse.json({
        user_id: user.id,
        color_scheme: null,
        wishlist_is_public: false,
        wishlist_share_token: null,
        wishlist_apply_colors: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    }

    return NextResponse.json(settings)
  } catch (error) {
    console.error("Error fetching settings:", error)
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const {
      color_scheme,
      wishlist_is_public,
      wishlist_apply_colors,
      wishlist_share_token,
    } = body

    // Validate color_scheme if provided
    if (color_scheme !== undefined && color_scheme !== null) {
      if (typeof color_scheme !== "object") {
        return NextResponse.json(
          { error: "Invalid color_scheme format" },
          { status: 400 }
        )
      }
    }

    // Check if settings exist
    const { data: existing } = await supabase
      .from("user_settings")
      .select("wishlist_share_token")
      .eq("user_id", user.id)
      .single()

    const updateData: {
      color_scheme?: ColorScheme | null
      wishlist_is_public?: boolean
      wishlist_share_token?: string | null
      wishlist_apply_colors?: boolean
    } = {}

    if (color_scheme !== undefined) {
      updateData.color_scheme = color_scheme
    }

    // Handle wishlist_share_token if explicitly provided
    if (wishlist_share_token !== undefined) {
      updateData.wishlist_share_token = wishlist_share_token
    }

    if (wishlist_is_public !== undefined) {
      updateData.wishlist_is_public = wishlist_is_public

      // Generate share token if making public and token doesn't exist (only if not already set above)
      if (wishlist_is_public && !existing?.wishlist_share_token && wishlist_share_token === undefined) {
        updateData.wishlist_share_token = generateShareToken()
      } else if (!wishlist_is_public && wishlist_share_token === undefined) {
        // Clear token when making private (only if not explicitly set)
        updateData.wishlist_share_token = null
      }
    }

    if (wishlist_apply_colors !== undefined) {
      updateData.wishlist_apply_colors = wishlist_apply_colors
    }

    // Upsert settings
    const { data: updated, error } = await supabase
      .from("user_settings")
      .upsert(
        {
          user_id: user.id,
          ...updateData,
        },
        {
          onConflict: "user_id",
        }
      )
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Error updating settings:", error)
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    )
  }
}
