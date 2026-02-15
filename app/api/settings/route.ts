import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { generateShareToken } from "@/lib/settings"
import { Theme } from "@/lib/types"
import { FONT_OPTIONS } from "@/lib/fonts"
import type { FontFamilyId } from "@/lib/fonts"
import { NAME_MAX_LENGTH, NAME_MAX_MESSAGE } from "@/lib/validation"

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
      return NextResponse.json({
        user_id: user.id,
        color_scheme: null,
        font_family: null,
        border_radius: null,
        graph_overlay: null,
        wishlist_is_public: false,
        wishlist_share_token: null,
        wishlist_apply_colors: false,
        use_custom_display_name: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    }

    // Merge stored display prefs into color_scheme for clients (graph_overlay is separate)
    const colorScheme = settings.color_scheme as Theme | null | undefined
    if (colorScheme && typeof colorScheme === "object") {
      settings.color_scheme = {
        ...colorScheme,
        radius: settings.border_radius ?? colorScheme.radius ?? "0.5rem",
      }
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
      theme,
      color_scheme,
      font_family,
      border_radius,
      graph_overlay,
      wishlist_is_public,
      wishlist_apply_colors,
      regenerate_wishlist_token,
      use_custom_display_name,
      name: displayName,
      avatar_url: avatarUrl,
    } = body

    const themePayload = theme ?? color_scheme
    if (themePayload !== undefined && themePayload !== null) {
      if (typeof themePayload !== "object") {
        return NextResponse.json(
          { error: "Invalid theme format" },
          { status: 400 }
        )
      }
    }

    const updateData: {
      color_scheme?: Theme | null
      font_family?: string | null
      border_radius?: string | null
      graph_overlay?: boolean | null
      wishlist_is_public?: boolean
      wishlist_share_token?: string | null
      wishlist_apply_colors?: boolean
      use_custom_display_name?: boolean
    } = {}

    if (themePayload !== undefined) {
      updateData.color_scheme = themePayload
      updateData.border_radius = themePayload.radius ?? undefined
    }

    const validFontValues = new Set(FONT_OPTIONS.map((o) => o.value))
    if (font_family !== undefined) {
      updateData.font_family = validFontValues.has(font_family as FontFamilyId) ? font_family : null
    }
    if (border_radius !== undefined && typeof border_radius === "string") {
      updateData.border_radius = border_radius.trim() || null
    }
    if (graph_overlay !== undefined) {
      updateData.graph_overlay = Boolean(graph_overlay)
    }

    // Check if settings exist
    const { data: existing } = await supabase
      .from("user_settings")
      .select("wishlist_share_token")
      .eq("user_id", user.id)
      .single()

    // Wishlist share token is server-only: never accept from client; generate or clear on server.
    if (regenerate_wishlist_token) {
      updateData.wishlist_share_token = generateShareToken()
    } else if (wishlist_is_public !== undefined) {
      updateData.wishlist_is_public = wishlist_is_public
      if (wishlist_is_public && !existing?.wishlist_share_token) {
        updateData.wishlist_share_token = generateShareToken()
      } else if (!wishlist_is_public) {
        updateData.wishlist_share_token = null
      }
    }

    if (wishlist_apply_colors !== undefined) {
      updateData.wishlist_apply_colors = wishlist_apply_colors
    }

    if (use_custom_display_name !== undefined) {
      updateData.use_custom_display_name = Boolean(use_custom_display_name)
    }

    if (typeof displayName === "string" && displayName.trim().length > NAME_MAX_LENGTH) {
      return NextResponse.json(
        { error: NAME_MAX_MESSAGE },
        { status: 400 }
      )
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

    // Update display name and/or avatar in public.users if provided
    const userUpdates: { name?: string; avatar_url?: string | null; updated_at: string } = {
      updated_at: new Date().toISOString(),
    }
    if (typeof displayName === "string") {
      userUpdates.name = displayName.trim()
    }
    if (avatarUrl !== undefined) {
      const allowed =
        avatarUrl === null ||
        avatarUrl === "" ||
        (typeof avatarUrl === "string" &&
          avatarUrl.startsWith(
            `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/avatars/${user.id}/`
          ))
      userUpdates.avatar_url = allowed ? (avatarUrl || null) : null
    }
    if (userUpdates.name !== undefined || userUpdates.avatar_url !== undefined) {
      await supabase.from("users").update(userUpdates).eq("id", user.id)
    }

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Error updating settings:", error)
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    )
  }
}
