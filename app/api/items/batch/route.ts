import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createItems } from "@/lib/api/create-item"

interface BatchItemRequest {
  items: Array<{
    name: string
    description?: string | null
    current_value?: number | null
    acquisition_date?: string | null
    acquisition_price?: number | null
    expected_price?: number | null
    thumbnail_url?: string | null
    box_id?: string | null
    is_wishlist: boolean
    photos: { url: string; storage_path?: string; is_thumbnail: boolean }[]
    tag_ids?: string[]
    value_history?: { value: number; recorded_at: string }[]
  }>
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

    const body: BatchItemRequest = await request.json()

    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { error: "items array is required and must not be empty" },
        { status: 400 }
      )
    }

    // Validate required fields
    for (const item of body.items) {
      if (!item.name || !item.name.trim()) {
        return NextResponse.json(
          { error: "Name is required for all items" },
          { status: 400 }
        )
      }
    }

    // Prepare items for batch creation
    const items = body.items.map((item) => {
      const thumbnailUrl =
        item.photos?.find((p) => p.is_thumbnail)?.url ?? item.thumbnail_url ?? null
      
      let acquisitionDate: string | null = null
      if (!item.is_wishlist) {
        acquisitionDate = item.acquisition_date ?? new Date().toISOString().split("T")[0]
      }

      return {
        itemData: {
          name: item.name.trim(),
          description: item.description?.trim() || null,
          current_value: item.current_value ?? null,
          acquisition_date: acquisitionDate,
          acquisition_price: item.is_wishlist ? null : (item.acquisition_price ?? null),
          expected_price: item.is_wishlist ? (item.expected_price ?? null) : null,
          thumbnail_url: thumbnailUrl,
          box_id: item.is_wishlist ? null : (item.box_id || null),
          user_id: user.id,
          is_wishlist: item.is_wishlist,
        },
        photos: item.photos,
        tagIds: item.tag_ids ?? [],
        valueHistory: item.value_history,
        currentValue: item.current_value,
      }
    })

    const result = await createItems({
      supabase,
      userId: user.id,
      items,
    })

    return NextResponse.json({ success: true, itemIds: result.itemIds, operations: result.operations })
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : "Failed to create items"

    console.error("Error creating items batch:", message, error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
