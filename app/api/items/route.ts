import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

interface PhotoData {
  url: string
  storage_path?: string // Storage path for Supabase storage files
  is_thumbnail: boolean
}

interface ItemSaveRequest {
  id?: string // If present, update; otherwise create
  name: string
  description?: string | null
  current_value?: number | null
  acquisition_date?: string | null
  acquisition_price?: number | null
  expected_price?: number | null
  thumbnail_url?: string | null
  box_id?: string | null
  is_wishlist: boolean
  photos: PhotoData[]
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body: ItemSaveRequest = await request.json()

    // Validate required fields
    if (!body.name || !body.name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }

    const isNew = !body.id
    const thumbnailUrl = body.photos?.find((p) => p.is_thumbnail)?.url ?? body.thumbnail_url ?? null

    const itemData: Record<string, unknown> = {
      name: body.name.trim(),
      description: body.description?.trim() || null,
      current_value: body.current_value ?? null,
      acquisition_date: body.is_wishlist ? null : (body.acquisition_date || null),
      acquisition_price: body.is_wishlist ? null : (body.acquisition_price ?? null),
      expected_price: body.is_wishlist ? (body.expected_price ?? null) : null,
      thumbnail_url: thumbnailUrl,
      box_id: body.is_wishlist ? null : (body.box_id || null),
      user_id: user.id,
      is_wishlist: body.is_wishlist,
    }

    let itemId: string

    if (isNew) {
      // Create new item
      const { data: newItem, error } = await supabase
        .from("items")
        .insert(itemData)
        .select("id")
        .single()

      if (error) throw error
      if (!newItem) throw new Error("Failed to create item")
      itemId = newItem.id
    } else {
      // Update existing item
      itemId = body.id!
      const { error } = await supabase
        .from("items")
        .update(itemData)
        .eq("id", itemId)
        .eq("user_id", user.id)

      if (error) throw error
    }

    // Sync photos table: replace all photos for this item
    const { error: deleteError } = await supabase
      .from("photos")
      .delete()
      .eq("item_id", itemId)

    if (deleteError) throw deleteError

    if (body.photos && body.photos.length > 0) {
      const { error: insertError } = await supabase.from("photos").insert(
        body.photos.map((p) => ({
          item_id: itemId,
          url: p.url,
          storage_path: p.storage_path || null,
          is_thumbnail: p.is_thumbnail,
        }))
      )

      if (insertError) throw insertError
    }

    // Value history: record when value changed (edit) or set (new item)
    const newVal = body.current_value ?? null
    if (isNew) {
      if (newVal != null) {
        const { error: historyError } = await supabase
          .from("value_history")
          .insert({ item_id: itemId, value: newVal })

        if (historyError) throw historyError
      }
    } else {
      // Check if value changed from latest record
      const { data: latestRecord } = await supabase
        .from("value_history")
        .select("value")
        .eq("item_id", itemId)
        .order("recorded_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      const latestValue = latestRecord?.value != null ? Number(latestRecord.value) : null
      const valueDiffersFromLatest =
        (latestValue === null) !== (newVal === null) ||
        (latestValue !== null && newVal !== null && Math.abs(latestValue - newVal) >= 1e-6)

      if (valueDiffersFromLatest) {
        const { error: historyError } = await supabase.from("value_history").insert({
          item_id: itemId,
          value: newVal ?? 0,
        })

        if (historyError) throw historyError
      }
    }

    return NextResponse.json({ success: true, itemId })
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : "Failed to save item"

    console.error("Error saving item:", message, error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
