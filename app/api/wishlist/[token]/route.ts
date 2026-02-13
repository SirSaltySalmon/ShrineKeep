import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const params = await context.params
    const { token } = params

    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 })
    }

    const supabase = await createSupabaseServerClient()

    // Find user settings by token
    const { data: settings, error: settingsError } = await supabase
      .from("user_settings")
      .select("user_id, wishlist_is_public, wishlist_apply_colors")
      .eq("wishlist_share_token", token)
      .eq("wishlist_is_public", true)
      .single()

    if (settingsError || !settings) {
      return NextResponse.json(
        { error: "Wishlist not found or not public" },
        { status: 404 }
      )
    }

    // If apply colors is true, get the color scheme
    let colorScheme = null
    if (settings.wishlist_apply_colors) {
      const { data: colorSchemeData } = await supabase
        .from("user_settings")
        .select("color_scheme")
        .eq("user_id", settings.user_id)
        .single()
      
      colorScheme = colorSchemeData?.color_scheme || null
    }

    // Get user info
    const { data: user } = await supabase
      .from("users")
      .select("id, name, username")
      .eq("id", settings.user_id)
      .single()

    // Get wishlist items
    const { data: items, error: itemsError } = await supabase
      .from("items")
      .select(`
        *,
        photos (*)
      `)
      .eq("user_id", settings.user_id)
      .eq("is_wishlist", true)
      .order("created_at", { ascending: false })

    if (itemsError) {
      console.error("Error fetching wishlist items:", itemsError)
      return NextResponse.json(
        { error: "Failed to fetch wishlist items" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      user: {
        id: user?.id,
        name: user?.name,
        username: user?.username,
      },
      items: items || [],
      applyColors: settings.wishlist_apply_colors,
      colorScheme: colorScheme,
    })
  } catch (error) {
    console.error("Error fetching public wishlist:", error)
    return NextResponse.json(
      { error: "Failed to fetch wishlist" },
      { status: 500 }
    )
  }
}
