import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { Theme } from "@/lib/types"
import { getDefaultColorScheme } from "@/lib/settings"
import { DEFAULT_FONT_FAMILY } from "@/lib/fonts"
import type { FontFamilyId } from "@/lib/fonts"

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
      .select("color_scheme, font_family, border_radius, graph_overlay")
      .eq("user_id", user.id)
      .single()

    if (error) {
      throw error
    }

    const colorScheme = (settings?.color_scheme as Theme | null) ?? null
    const fontFamily = (settings?.font_family as FontFamilyId | null) ?? DEFAULT_FONT_FAMILY
    const radius = settings?.border_radius ?? colorScheme?.radius ?? "0.5rem"
    const graphOverlay = settings?.graph_overlay ?? colorScheme?.graphOverlay ?? true

    const theme: Theme | null = colorScheme
      ? { ...getDefaultColorScheme(), ...colorScheme, radius, graphOverlay }
      : null

    return NextResponse.json({
      theme,
      font_family: fontFamily,
    })
  } catch (error) {
    console.error("Error fetching settings:", error)
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    )
  }
}