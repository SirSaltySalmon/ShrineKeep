import { createSupabaseServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createItems } from "@/lib/api/create-item"
import { ItemCapExceededError } from "@/lib/api/item-cap-error"
import { expandItemRefsToCreateInputs } from "@/lib/api/copy-expand"
import { getOwnedBoxIdSet } from "@/lib/api/validate-box-ownership"

interface BatchItemsBody {
  items: Array<{
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
    photos: { url: string; storage_path?: string; is_thumbnail: boolean }[]
    tag_ids?: string[]
    value_history?: { value: number; recorded_at: string }[]
  }>
}

interface BatchRefsBody {
  sourceItemIds: string[]
  target: {
    boxId: string | null
    isWishlist: boolean
    preserveItemKindsInBox?: boolean
  }
}

type BatchItemRequest = BatchItemsBody | BatchRefsBody

function isReferenceMode(body: BatchItemRequest): body is BatchRefsBody {
  return "sourceItemIds" in body
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

    const body = (await request.json()) as BatchItemRequest

    let expandedItems: BatchItemsBody["items"] = []
    if (isReferenceMode(body)) {
      if (!Array.isArray(body.sourceItemIds) || body.sourceItemIds.length === 0) {
        return NextResponse.json(
          { error: "sourceItemIds array is required and must not be empty" },
          { status: 400 }
        )
      }
      if (!body.target || typeof body.target.isWishlist !== "boolean") {
        return NextResponse.json(
          { error: "target with isWishlist is required" },
          { status: 400 }
        )
      }
      expandedItems = await expandItemRefsToCreateInputs(
        supabase,
        user.id,
        body.sourceItemIds,
        {
          boxId: body.target.boxId ?? null,
          isWishlist: body.target.isWishlist,
          preserveItemKindsInBox: body.target.preserveItemKindsInBox === true,
        }
      )
    } else if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { error: "items array is required and must not be empty" },
        { status: 400 }
      )
    } else {
      expandedItems = body.items
    }

    // Validate required fields
    for (const item of expandedItems) {
      if (!item.name || !item.name.trim()) {
        return NextResponse.json(
          { error: "Name is required for all items" },
          { status: 400 }
        )
      }
    }

    // Prepare items for batch creation
    const boxIdsToValidate: string[] = []
    for (const item of expandedItems) {
      if (!item.is_wishlist && item.box_id) {
        boxIdsToValidate.push(item.box_id)
      }
      if (item.is_wishlist && item.wishlist_target_box_id) {
        boxIdsToValidate.push(item.wishlist_target_box_id)
      }
    }
    const ownedBoxIds = await getOwnedBoxIdSet(supabase, user.id, boxIdsToValidate)

    const items = expandedItems.map((item) => {
      const thumbnailUrl =
        item.photos?.find((p) => p.is_thumbnail)?.url ?? item.thumbnail_url ?? null
      const collectionBoxId = item.is_wishlist ? null : (item.box_id || null)
      const wishlistTargetBoxId = item.is_wishlist ? (item.wishlist_target_box_id || null) : null

      if (collectionBoxId && !ownedBoxIds.has(collectionBoxId)) {
        throw new Error("box_id must reference one of your boxes")
      }
      if (wishlistTargetBoxId && !ownedBoxIds.has(wishlistTargetBoxId)) {
        throw new Error("wishlist_target_box_id must reference one of your boxes")
      }
      
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
          box_id: collectionBoxId,
          wishlist_target_box_id: wishlistTargetBoxId,
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
    if (error instanceof ItemCapExceededError) {
      return NextResponse.json(
        { error: "item_limit_reached", currentCount: error.currentCount, cap: error.cap },
        { status: 403 }
      )
    }
    if (
      error instanceof Error &&
      (error.message.includes("could not be found") ||
        error.message.includes("must reference one of your boxes") ||
        error.message.includes("Only wishlist items can be pasted"))
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

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
