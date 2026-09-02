import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { requireMutableUser } from "@/lib/judge/require-mutable-user"
import { createBoxes } from "@/lib/api/create-box"
import { createItems } from "@/lib/api/create-item"
import { ItemCapExceededError } from "@/lib/api/item-cap-error"
import { getOwnedBoxIdSet } from "@/lib/api/validate-box-ownership"
import { creationDescription } from "@/lib/webmcp/description-context"

const MAX_CREATE_SIZE = 500
const MAX_PRICE = 99_999_999.99

interface SuggestedCreateItem {
  description?: string | null
  name: string
  item_kind: "collection" | "wishlist"
  current_value?: number | null
  acquisition_price?: number | null
  expected_price?: number | null
  photos?: SuggestedCreatePhoto[]
}

interface SuggestedCreatePhoto {
  url: string
  is_thumbnail: boolean
}

interface SuggestedCreateRequest {
  attach_price_evidence?: boolean
  mode?: "preview" | "apply"
  createNewBox?: boolean
  parentBoxId?: string | null
  targetBoxId?: string | null
  newBoxName?: string
  items?: SuggestedCreateItem[]
}

function validOptionalPrice(value: unknown): value is number | null | undefined {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MAX_PRICE)
  )
}

function normalizePhotos(value: unknown): SuggestedCreatePhoto[] | null {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 20) return null

  const photos: SuggestedCreatePhoto[] = []
  let thumbnailCount = 0
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null
    const candidate = raw as Partial<SuggestedCreatePhoto>
    if (typeof candidate.url !== "string" || candidate.url.length > 4096) return null
    try {
      const url = new URL(candidate.url)
      if (url.protocol !== "http:" && url.protocol !== "https:") return null
      if (typeof candidate.is_thumbnail !== "boolean") return null
      if (candidate.is_thumbnail) thumbnailCount += 1
      if (thumbnailCount > 1) return null
      photos.push({ url: url.toString(), is_thumbnail: candidate.is_thumbnail })
    } catch {
      return null
    }
  }

  return photos
}

function normalizeItems(input: unknown, attachPriceEvidence: boolean): SuggestedCreateItem[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_CREATE_SIZE) return null
  const seen = new Set<string>()
  const items: SuggestedCreateItem[] = []

  for (const raw of input) {
    if (!raw || typeof raw !== "object") return null
    const candidate = raw as SuggestedCreateItem
    let description: string | null
    try {
      description = creationDescription(candidate.description, attachPriceEvidence)
    } catch {
      return null
    }
    const name = typeof candidate.name === "string" ? candidate.name.trim() : ""
    if (!name || name.length > 200) return null
    if (candidate.item_kind !== "collection" && candidate.item_kind !== "wishlist") return null
    const photos = normalizePhotos(candidate.photos)
    if (!photos) return null
    if (
      !validOptionalPrice(candidate.current_value) ||
      !validOptionalPrice(candidate.acquisition_price) ||
      !validOptionalPrice(candidate.expected_price)
    ) {
      return null
    }
    if (
      (candidate.item_kind === "wishlist" && candidate.acquisition_price != null) ||
      (candidate.item_kind === "collection" && candidate.expected_price != null)
    ) {
      return null
    }
    const key = name.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    items.push({
      description,
      name,
      item_kind: candidate.item_kind,
      current_value: candidate.current_value ?? null,
      acquisition_price: candidate.acquisition_price ?? null,
      expected_price: candidate.expected_price ?? null,
      photos,
    })
  }

  return items
}

export async function POST(request: NextRequest) {
  let createdBoxId: string | null = null
  let authenticatedUserId: string | null = null
  try {
    const session = await requireMutableUser()
    if (!session.ok) return session.response
    const { supabase, user } = session
    authenticatedUserId = user.id

    const body = (await request.json()) as SuggestedCreateRequest
    if (body.attach_price_evidence !== undefined && typeof body.attach_price_evidence !== "boolean") {
      return NextResponse.json({ error: "attach_price_evidence must be a boolean" }, { status: 400 })
    }
    const items = normalizeItems(body.items, body.attach_price_evidence === true)
    const newBoxName = typeof body.newBoxName === "string" ? body.newBoxName.trim() : ""
    const createNewBox = body.createNewBox === true
    if (!items) {
      return NextResponse.json(
        { error: `items must contain 1-${MAX_CREATE_SIZE} valid entries` },
        { status: 400 }
      )
    }
    if (createNewBox && (!newBoxName || newBoxName.length > 200)) {
      return NextResponse.json({ error: "newBoxName is required" }, { status: 400 })
    }

    const parentBoxId =
      typeof body.parentBoxId === "string" && body.parentBoxId ? body.parentBoxId : null
    const targetBoxId =
      typeof body.targetBoxId === "string" && body.targetBoxId ? body.targetBoxId : null
    const destinationBoxId = createNewBox ? parentBoxId : targetBoxId
    if (destinationBoxId) {
      const owned = await getOwnedBoxIdSet(supabase, user.id, [destinationBoxId])
      if (!owned.has(destinationBoxId)) {
        return NextResponse.json(
          { error: createNewBox ? "Parent box not found" : "Target box not found" },
          { status: 404 }
        )
      }
    }

    if (body.mode === "preview") {
      const { data, error } = await supabase
        .from("items")
        .select("name, is_wishlist, box_id, wishlist_target_box_id")
        .eq("user_id", user.id)
      if (error) throw error
      const matches = new Map<string, "collection" | "wishlist">()
      for (const row of data ?? []) {
        if (!createNewBox) {
          const rowBoxId = row.is_wishlist ? row.wishlist_target_box_id : row.box_id
          if ((rowBoxId ?? null) !== targetBoxId) continue
        }
        const key = String(row.name ?? "").trim().toLocaleLowerCase()
        if (!key) continue
        const kind = row.is_wishlist ? "wishlist" : "collection"
        if (!matches.has(key) || kind === "collection") matches.set(key, kind)
      }
      return NextResponse.json({
        items: items.map((item) => ({
          name: item.name,
          existingMatch: matches.get(item.name.toLocaleLowerCase()) ?? null,
        })),
      })
    }

    if (body.mode !== "apply") {
      return NextResponse.json({ error: "mode must be preview or apply" }, { status: 400 })
    }

    let appliedBoxId = targetBoxId
    if (createNewBox) {
      ;[createdBoxId] = await createBoxes(supabase, user.id, [
        { name: newBoxName, parent_box_id: parentBoxId },
      ])
      appliedBoxId = createdBoxId
    }

    const acquisitionDate = new Date().toISOString().slice(0, 10)
    const result = await createItems({
      supabase,
      userId: user.id,
      items: items.map((item) => {
        const wishlist = item.item_kind === "wishlist"
        const thumbnailUrl = item.photos?.find((photo) => photo.is_thumbnail)?.url ?? null
        return {
          itemData: {
            name: item.name,
            description: item.description ?? null,
            current_value: item.current_value ?? null,
            acquisition_date: wishlist ? null : acquisitionDate,
            acquisition_price: wishlist ? null : (item.acquisition_price ?? null),
            expected_price: wishlist ? (item.expected_price ?? null) : null,
            thumbnail_url: thumbnailUrl,
            box_id: wishlist ? null : appliedBoxId,
            wishlist_target_box_id: wishlist ? appliedBoxId : null,
            user_id: user.id,
            is_wishlist: wishlist,
          },
          photos: item.photos ?? [],
          tagIds: [],
          currentValue: item.current_value ?? null,
        }
      }),
    })

    return NextResponse.json({ success: true, boxId: appliedBoxId, itemIds: result.itemIds })
  } catch (error: unknown) {
    const supabase = await createSupabaseServerClient().catch(() => null)
    if (createdBoxId && authenticatedUserId && supabase) {
      try {
        await supabase
          .from("boxes")
          .delete()
          .eq("id", createdBoxId)
          .eq("user_id", authenticatedUserId)
      } catch {
        // Best-effort rollback; retain the original creation error below.
      }
    }
    if (error instanceof ItemCapExceededError) {
      return NextResponse.json(
        { error: "item_limit_reached", currentCount: error.currentCount, cap: error.cap },
        { status: 403 }
      )
    }
    const message = error instanceof Error ? error.message : "Failed to create staged items"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
