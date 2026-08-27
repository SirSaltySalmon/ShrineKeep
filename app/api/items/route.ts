import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createItems } from "@/lib/api/create-item"
import { applyItemPatch, ItemNotFoundError } from "@/lib/api/patch-item"
import { ItemCapExceededError } from "@/lib/api/item-cap-error"
import { getOwnedBoxIdSet } from "@/lib/api/validate-box-ownership"
import { captureRouteException } from "@/lib/monitoring/sentry"
import type { ItemPatch, ItemPhotoOps } from "@/lib/item-patch"

interface PhotoData {
  url: string
  storage_path?: string
  is_thumbnail: boolean
}

interface ItemCreateRequest {
  id?: string
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
  value_history?: { value: number; recorded_at: string }[]
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error
    ? error.message
    : typeof error === "object" && error !== null && "message" in error
      ? String((error as { message: unknown }).message)
      : fallback
}

export async function POST(request: NextRequest) {
  let userId: string | null = null
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    userId = user?.id ?? null

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body: ItemCreateRequest = await request.json()

    if (body.id) {
      return NextResponse.json(
        { error: "Use PATCH to update an existing item" },
        { status: 400 }
      )
    }

    if (!body.name || !body.name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }

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

    let acquisitionDate: string | null = null
    if (!body.is_wishlist) {
      acquisitionDate = body.acquisition_date ?? null
      if (acquisitionDate === null) acquisitionDate = new Date().toISOString().split("T")[0]
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

    const result = await createItems({
      supabase,
      userId: user.id,
      items: [
        {
          itemData,
          photos: body.photos,
          tagIds,
          valueHistory: body.value_history,
          currentValue: body.current_value,
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

    const message = errorMessage(error, "Failed to save item")
    console.error("Error saving item:", message, error)
    captureRouteException(error, {
      area: "items",
      route: "/api/items",
      userId,
      tags: {
        operation: "save_item",
      },
    })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  let userId: string | null = null
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    userId = user?.id ?? null

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = (await request.json()) as ItemPatch
    if (!body.id || typeof body.id !== "string") {
      return NextResponse.json({ error: "id is required" }, { status: 400 })
    }

    if (body.name !== undefined && !body.name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }

    const boxIdsToValidate = [
      ...(body.box_id ? [body.box_id] : []),
      ...(body.wishlist_target_box_id ? [body.wishlist_target_box_id] : []),
    ]
    const ownedBoxIds = await getOwnedBoxIdSet(supabase, user.id, boxIdsToValidate)
    if (body.box_id && !ownedBoxIds.has(body.box_id)) {
      return NextResponse.json({ error: "box_id must reference one of your boxes" }, { status: 400 })
    }
    if (body.wishlist_target_box_id && !ownedBoxIds.has(body.wishlist_target_box_id)) {
      return NextResponse.json(
        { error: "wishlist_target_box_id must reference one of your boxes" },
        { status: 400 }
      )
    }

    if (body.photos) {
      const photos = body.photos as ItemPhotoOps
      const invalid =
        (photos.create && !Array.isArray(photos.create)) ||
        (photos.update && !Array.isArray(photos.update)) ||
        (photos.delete && !Array.isArray(photos.delete))
      if (invalid) {
        return NextResponse.json({ error: "Invalid photos patch" }, { status: 400 })
      }
    }

    if (body.tag_ids !== undefined && !Array.isArray(body.tag_ids)) {
      return NextResponse.json({ error: "tag_ids must be an array" }, { status: 400 })
    }

    const result = await applyItemPatch({
      supabase,
      userId: user.id,
      patch: body,
    })

    return NextResponse.json({ success: true, itemId: result.itemId })
  } catch (error: unknown) {
    if (error instanceof ItemNotFoundError) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 })
    }

    const message = errorMessage(error, "Failed to update item")
    console.error("Error updating item:", message, error)
    captureRouteException(error, {
      area: "items",
      route: "/api/items",
      userId,
      tags: {
        operation: "patch_item",
      },
    })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
