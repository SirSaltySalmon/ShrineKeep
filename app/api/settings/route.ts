import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createSupabaseServiceClient } from "@/lib/supabase/service"
import { generateShareToken } from "@/lib/settings"
import { Theme } from "@/lib/types"
import { FONT_OPTIONS } from "@/lib/fonts"
import type { FontFamilyId } from "@/lib/fonts"
import { NAME_MAX_LENGTH, NAME_MAX_MESSAGE } from "@/lib/validation"
import { requireMutableUser } from "@/lib/judge/require-mutable-user"
import { assertNotSandbox } from "@/lib/judge/sandbox"
import { createSharingMutationCore } from "@/lib/sharing/server/mutation-core"

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
        header_font_family: "Inter",
        body_font_family: "Inter",
        border_radius: null,
        graph_overlay: null,
        wishlist_link_enabled: false,
        wishlist_share_token: null,
        wishlist_apply_colors: false,
        ai_widget_visible: true,
        dashboard_demo_prompt_dismissed: false,
        ai_tutorial_reset_at: null,
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

    return NextResponse.json(await attachOwnerSharing(user.id, settings))
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
    const session = await requireMutableUser()
    if (!session.ok) return session.response
    const { supabase, user } = session

    const body = await request.json()
    const {
      theme,
      color_scheme,
      header_font_family,
      body_font_family,
      border_radius,
      graph_overlay,
      wishlist_link_enabled,
      wishlist_apply_colors,
      regenerate_wishlist_token,
      ai_widget_visible,
      restart_ai_tutorial,
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
      header_font_family?: string
      body_font_family?: string
      border_radius?: string | null
      graph_overlay?: boolean | null
      wishlist_link_enabled?: boolean
      wishlist_share_token?: string | null
      wishlist_apply_colors?: boolean
      ai_widget_visible?: boolean
      dashboard_demo_prompt_dismissed?: boolean
      ai_tutorial_reset_at?: string
    } = {}

    for (const value of [ai_widget_visible, restart_ai_tutorial]) {
      if (value !== undefined && typeof value !== "boolean") {
        return NextResponse.json({ error: "AI preferences must be booleans" }, { status: 400 })
      }
    }
    if (ai_widget_visible !== undefined) updateData.ai_widget_visible = ai_widget_visible
    if (restart_ai_tutorial === true) {
      updateData.dashboard_demo_prompt_dismissed = false
      updateData.ai_widget_visible = true
      updateData.ai_tutorial_reset_at = new Date().toISOString()
    }

    if (themePayload !== undefined) {
      updateData.color_scheme = themePayload
      updateData.border_radius = themePayload.radius ?? undefined
    }

    const validFontValues = new Set(FONT_OPTIONS.map((o) => o.value))
    if (header_font_family !== undefined) {
      updateData.header_font_family = validFontValues.has(header_font_family as FontFamilyId)
        ? header_font_family
        : "Inter"
    }
    if (body_font_family !== undefined) {
      updateData.body_font_family = validFontValues.has(body_font_family as FontFamilyId)
        ? body_font_family
        : "Inter"
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
    } else if (wishlist_link_enabled !== undefined) {
      if (wishlist_link_enabled) {
        const sandbox = await assertNotSandbox(supabase, user.id)
        if (!sandbox.ok) {
          return NextResponse.json({ error: sandbox.error }, { status: sandbox.status })
        }
      }
      updateData.wishlist_link_enabled = wishlist_link_enabled
      if (wishlist_link_enabled && !existing?.wishlist_share_token) {
        updateData.wishlist_share_token = generateShareToken()
      }
    }

    if (wishlist_apply_colors !== undefined) {
      updateData.wishlist_apply_colors = wishlist_apply_colors
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

    return NextResponse.json(await attachOwnerSharing(user.id, updated))
  } catch (error) {
    console.error("Error updating settings:", error)
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    )
  }
}

async function attachOwnerSharing(userId: string, settings: Record<string, unknown>) {
  if (process.env.SOCIAL_SHARING_EDITS_ENABLED !== "true") return settings
  try {
    const service = createSupabaseServiceClient()
    const core = createSharingMutationCore((name, args) => service.rpc(name, args))
    const result = await core.readOwnerSettings(userId)
    if (!result.ok) return settings
    return {
      ...settings,
      wishlist_link_enabled: result.data.wishlistLinkEnabled,
      wishlist_share_token: result.data.wishlistShareToken,
      public_bio: result.data.bio,
      profile_share_style: result.data.profileShareStyle,
      root_collection_visibility: result.data.root.collectionVisibility,
      root_share_financials: result.data.root.shareFinancials,
      root_wishlist_visibility: result.data.root.wishlistVisibility,
      sharing_revision: result.data.revision,
      wishlist_guest_visible_count: result.data.wishlistGuestVisibleCount,
      wishlist_guest_total_count: result.data.wishlistGuestTotalCount,
    }
  } catch {
    return settings
  }
}
