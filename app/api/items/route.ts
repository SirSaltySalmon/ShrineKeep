import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createItems } from "@/lib/api/create-item"
import { ItemCapExceededError } from "@/lib/api/item-cap-error"
import { getOwnedBoxIdSet } from "@/lib/api/validate-box-ownership"

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
  wishlist_target_box_id?: string | null
  is_wishlist: boolean
  photos: PhotoData[]
  tag_ids?: string[]
  value_history?: { value: number; recorded_at: string }[] // For copied items
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
    const collectionBoxId = body.is_wishlist ? null : (body.box_id || null)
    const wishlistTargetBoxId = body.is_wishlist ? (body.wishlist_target_box_id || null) : null

    const boxIdsToValidate = [
      ...(collectionBoxId ? [collectionBoxId] : []),
      ...(wishlistTargetBoxId ? [wishlistTargetBoxId] : []),
    ]
    const ownedBoxIds = await getOwnedBoxIdSet(supabase, user.id, boxIdsToValidate)
    if (collectionBoxId && !ownedBoxIds.has(collectionBoxId)) {
      return NextResponse.json({ error: "box_id must reference one of your boxes" }, { status: 400 })
    }
    if (wishlistTargetBoxId && !ownedBoxIds.has(wishlistTargetBoxId)) {
      return NextResponse.json(
        { error: "wishlist_target_box_id must reference one of your boxes" },
        { status: 400 }
      )
    }

    // For new collection items, default acquisition_date to today when not provided (same as manual "new item" creation)
    let acquisitionDate: string | null = null
    if (!body.is_wishlist) {
      acquisitionDate = body.acquisition_date ?? null
      if (isNew && acquisitionDate === null)
        acquisitionDate = new Date().toISOString().split("T")[0]
    }

    const itemData: Record<string, unknown> = {
      name: body.name.trim(),
      description: body.description?.trim() || null,
      current_value: body.current_value ?? null,
      acquisition_date: acquisitionDate,
      acquisition_price: body.is_wishlist ? null : (body.acquisition_price ?? null),
      expected_price: body.is_wishlist ? (body.expected_price ?? null) : null,
      thumbnail_url: thumbnailUrl,
      box_id: collectionBoxId,
      wishlist_target_box_id: wishlistTargetBoxId,
      user_id: user.id,
      is_wishlist: body.is_wishlist,
    }

    const tagIds = Array.isArray(body.tag_ids) ? body.tag_ids : []

    // Use shared createItems function
    const result = await createItems({
      supabase,
      userId: user.id,
      items: [
        {
          itemData,
          photos: body.photos,
          tagIds,
          valueHistory: body.value_history, // For copied items
          currentValue: body.current_value,
          isUpdate: !isNew,
          itemId: isNew ? undefined : body.id,
        },
      ],
    })

    return NextResponse.json({ success: true, itemId: result.itemIds[0] })
  } catch (error: unknown) {
    if (error instanceof ItemCapExceededError) {
      return NextResponse.json(
        { error: "item_limit_reached", currentCount: error.currentCount, cap: error.cap },
        { status: 403 }
      )
    }

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
